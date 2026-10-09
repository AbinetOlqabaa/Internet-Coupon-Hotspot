import { randomBytes, pbkdf2Sync, timingSafeEqual, createHash } from 'node:crypto';
import type { RepositoryRegistry } from '../db/repositories.js';
import type { OwnerEntity, UserRole } from '../db/schema.js';

export interface SessionToken {
  token: string;
  ownerId: string;
  expiresAt: number; // Unix epoch ms
}

interface FailedAttemptTracker {
  count: number;
  lastAttempt: number;
}

export class AuthService {
  private sessions = new Map<string, SessionToken>();
  private failedAttempts = new Map<string, FailedAttemptTracker>();
  private readonly sessionTtlMs = 24 * 60 * 60 * 1000; // 24 hours
  private readonly maxFailedLogins = 5;
  private readonly lockoutWindowMs = 15 * 60 * 1000; // 15 minutes

  constructor(private db: RepositoryRegistry) {}

  hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  verifyPassword(password: string, storedHash: string): boolean {
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;
    const [salt, expectedHash] = parts;
    const computedHash = pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    try {
      return timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(expectedHash, 'hex'));
    } catch {
      return false;
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // Rate Limiting & Anti-Automation
  private checkRateLimit(identifier: string): void {
    const record = this.failedAttempts.get(identifier.toLowerCase());
    if (record) {
      const timeSinceLast = Date.now() - record.lastAttempt;
      if (timeSinceLast < this.lockoutWindowMs && record.count >= this.maxFailedLogins) {
        const remainingMinutes = Math.ceil((this.lockoutWindowMs - timeSinceLast) / 60000);
        throw new Error(
          `Too many failed attempts. Temporary security lockout active. Please try again in ${remainingMinutes} minute(s).`
        );
      }
      if (timeSinceLast >= this.lockoutWindowMs) {
        this.failedAttempts.delete(identifier.toLowerCase());
      }
    }
  }

  private recordFailedAttempt(identifier: string): void {
    const key = identifier.toLowerCase();
    const existing = this.failedAttempts.get(key);
    if (!existing || Date.now() - existing.lastAttempt >= this.lockoutWindowMs) {
      this.failedAttempts.set(key, { count: 1, lastAttempt: Date.now() });
    } else {
      existing.count += 1;
      existing.lastAttempt = Date.now();
    }
  }

  private clearFailedAttempts(identifier: string): void {
    this.failedAttempts.delete(identifier.toLowerCase());
  }

  // Initial Administrator Bootstrap
  async bootstrapAdmin(params: {
    email: string;
    password: string;
    displayName?: string;
    bootstrapToken?: string;
  }): Promise<{ user: Omit<OwnerEntity, 'passwordHash'>; token: string }> {
    const superAdminCount = await this.db.owners.countSuperAdmins();
    const configuredToken = process.env.ADMIN_BOOTSTRAP_TOKEN;

    // Allowed if no active SUPER_ADMIN exists OR if exact configured bootstrap token matches
    const canBootstrap =
      superAdminCount === 0 ||
      (configuredToken && params.bootstrapToken && params.bootstrapToken === configuredToken);

    if (!canBootstrap) {
      throw new Error('System already initialized. Administrator bootstrap is closed.');
    }

    if (params.password.length < 8) {
      throw new Error('Administrator password must be at least 8 characters.');
    }

    const normalizedEmail = params.email.trim().toLowerCase();
    let existing = await this.db.owners.findByEmail(normalizedEmail);

    const passwordHash = this.hashPassword(params.password);
    let adminUser: OwnerEntity;

    if (existing) {
      const updated = await this.db.owners.update(existing.id, {
        passwordHash,
        role: 'SUPER_ADMIN',
        displayName: params.displayName || 'System Administrator',
        isActive: true,
      });
      if (!updated) throw new Error('Failed to elevate administrator.');
      adminUser = updated;
    } else {
      adminUser = await this.db.owners.create({
        email: normalizedEmail,
        passwordHash,
        businessName: 'System Administration',
        displayName: params.displayName || 'System Administrator',
        role: 'SUPER_ADMIN',
        defaultCurrency: 'USD',
        isActive: true,
      });
    }

    const token = this.createSessionToken(adminUser.id);

    await this.db.audit.append({
      ownerId: adminUser.id,
      actor: adminUser.email,
      action: 'admin.bootstrapped',
      resourceType: 'system',
      resourceId: adminUser.id,
      details: { role: 'SUPER_ADMIN' },
    });

    const { passwordHash: _, ...safeUser } = adminUser;
    return { user: safeUser, token };
  }

  // Registration Workflow (Public creates OWNER, cannot self-assign SUPER_ADMIN)
  async register(params: {
    email: string;
    password: string;
    businessName: string;
    displayName?: string;
    currency?: 'USD' | 'EUR' | 'ETB' | 'KES';
  }): Promise<{ owner: Omit<OwnerEntity, 'passwordHash'>; token: string }> {
    const normalizedEmail = params.email.trim().toLowerCase();
    const existing = await this.db.owners.findByEmail(normalizedEmail);
    if (existing) {
      throw new Error('An account with this email already exists.');
    }

    if (params.password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }

    const passwordHash = this.hashPassword(params.password);
    const owner = await this.db.owners.create({
      email: normalizedEmail,
      passwordHash,
      businessName: params.businessName.trim(),
      displayName: params.displayName || params.businessName.trim(),
      role: 'OWNER', // Public registration default
      defaultCurrency: params.currency || 'USD',
      isActive: true,
    });

    const token = this.createSessionToken(owner.id);

    await this.db.audit.append({
      ownerId: owner.id,
      actor: owner.email,
      action: 'owner.registered',
      resourceType: 'owner',
      resourceId: owner.id,
      details: { businessName: owner.businessName, role: 'OWNER' },
    });

    const { passwordHash: _, ...safeOwner } = owner;
    return { owner: safeOwner, token };
  }

  // Login Workflow
  async login(
    email: string,
    password: string
  ): Promise<{ owner: Omit<OwnerEntity, 'passwordHash'>; token: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    this.checkRateLimit(normalizedEmail);

    const owner = await this.db.owners.findByEmail(normalizedEmail);
    if (!owner || !this.verifyPassword(password, owner.passwordHash)) {
      this.recordFailedAttempt(normalizedEmail);
      throw new Error('Invalid email or password.');
    }

    if (!owner.isActive) {
      throw new Error('Account has been deactivated. Please contact support.');
    }

    this.clearFailedAttempts(normalizedEmail);

    const now = new Date().toISOString();
    await this.db.owners.update(owner.id, { lastLoginAt: now });
    owner.lastLoginAt = now;

    const token = this.createSessionToken(owner.id);

    await this.db.audit.append({
      ownerId: owner.id,
      actor: owner.email,
      action: 'user.logged_in',
      resourceType: 'user',
      resourceId: owner.id,
      details: { role: owner.role },
    });

    const { passwordHash: _, ...safeOwner } = owner;
    return { owner: safeOwner, token };
  }

  // Password Change
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await this.db.owners.findById(userId);
    if (!user) throw new Error('User not found.');

    if (!this.verifyPassword(currentPassword, user.passwordHash)) {
      throw new Error('Current password does not match.');
    }

    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long.');
    }

    const newHash = this.hashPassword(newPassword);
    await this.db.owners.update(userId, { passwordHash: newHash });

    // Invalidate existing sessions
    this.invalidateUserSessions(userId);

    await this.db.audit.append({
      ownerId: user.id,
      actor: user.email,
      action: 'password.changed',
      resourceType: 'user',
      resourceId: user.id,
      details: {},
    });
  }

  // Forgot Password
  async forgotPassword(email: string): Promise<{ success: boolean; message: string; devResetToken?: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.db.owners.findByEmail(normalizedEmail);

    let devResetToken: string | undefined;

    if (user && user.isActive) {
      const resetToken = randomBytes(32).toString('hex');
      const tokenHash = this.hashToken(resetToken);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins

      await this.db.passwordResets.create(user.id, tokenHash, expiresAt);

      await this.db.audit.append({
        ownerId: user.id,
        actor: user.email,
        action: 'password_reset.requested',
        resourceType: 'user',
        resourceId: user.id,
        details: {},
      });

      // Provide token in non-production for automated tests and local preview
      if (process.env.NODE_ENV !== 'production') {
        devResetToken = resetToken;
      }
    }

    return {
      success: true,
      message: 'If the provided email is registered, password reset instructions have been sent.',
      devResetToken,
    };
  }

  // Reset Password
  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long.');
    }

    const tokenHash = this.hashToken(token);
    const validReset = await this.db.passwordResets.findValid(tokenHash);
    if (!validReset) {
      throw new Error('Password reset token is invalid, expired, or already used.');
    }

    const user = await this.db.owners.findById(validReset.userId);
    if (!user) throw new Error('User not found.');

    const newHash = this.hashPassword(newPassword);
    await this.db.owners.update(user.id, { passwordHash: newHash });
    await this.db.passwordResets.markUsed(validReset.id);

    // Invalidate sessions
    this.invalidateUserSessions(user.id);

    await this.db.audit.append({
      ownerId: user.id,
      actor: user.email,
      action: 'password.reset_completed',
      resourceType: 'user',
      resourceId: user.id,
      details: {},
    });
  }

  validateToken(token: string): string | null {
    const session = this.sessions.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return null;
    }
    return session.ownerId;
  }

  revokeToken(token: string): void {
    this.sessions.delete(token);
  }

  invalidateUserSessions(userId: string): void {
    for (const [token, session] of this.sessions.entries()) {
      if (session.ownerId === userId) {
        this.sessions.delete(token);
      }
    }
  }

  private createSessionToken(ownerId: string): string {
    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, {
      token,
      ownerId,
      expiresAt: Date.now() + this.sessionTtlMs,
    });
    return token;
  }
}
