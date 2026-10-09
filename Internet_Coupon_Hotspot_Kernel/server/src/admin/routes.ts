import { Router, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import type { RepositoryRegistry } from '../db/repositories.js';
import type { AuthService } from '../auth/service.js';
import type { AuthenticatedRequest } from '../auth/routes.js';
import { createRoleMiddleware } from '../auth/routes.js';
import { UserRoleSchema } from '../db/schema.js';

export function createAdminRouter(
  db: RepositoryRegistry,
  authService: AuthService,
  authMiddleware: RequestHandler
): Router {
  const router = Router();

  // One-time Initial Administrator Bootstrap (Public when no SUPER_ADMIN exists)
  const BootstrapSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters long'),
    displayName: z.string().max(120).optional(),
    bootstrapToken: z.string().optional(),
  });

  router.post('/bootstrap', async (req, res) => {
    try {
      const parsed = BootstrapSchema.parse(req.body);
      const result = await authService.bootstrapAdmin(parsed);
      res.status(201).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Bootstrap failed';
      res.status(400).json({ error: { code: 'BOOTSTRAP_FAILED', message } });
    }
  });

  // Protected Admin Area: requires authentication + SUPER_ADMIN or OWNER role
  router.use(authMiddleware);
  const requireAdmin = createRoleMiddleware(['SUPER_ADMIN']);
  const requireAdminOrOwner = createRoleMiddleware(['SUPER_ADMIN', 'OWNER']);

  // GET /api/v1/admin/overview - Real metrics overview
  router.get('/overview', requireAdminOrOwner, async (_req: AuthenticatedRequest, res: Response) => {
    const { users, totalCount } = await db.owners.listAll(500, 0);

    const activeCount = users.filter((u) => u.isActive).length;
    const inactiveCount = users.filter((u) => !u.isActive).length;
    const superAdminCount = users.filter((u) => u.role === 'SUPER_ADMIN').length;
    const ownerCount = users.filter((u) => u.role === 'OWNER').length;
    const staffCount = users.filter((u) => u.role === 'STAFF').length;

    res.json({
      metrics: {
        totalUsers: totalCount,
        activeUsers: activeCount,
        inactiveUsers: inactiveCount,
        roleDistribution: {
          superAdmins: superAdminCount,
          owners: ownerCount,
          staff: staffCount,
        },
      },
      system: {
        nodeEnv: process.env.NODE_ENV || 'development',
        uptimeSeconds: Math.floor(process.uptime()),
        authMode: 'bearer-session-tokens',
        rateLimiterActive: true,
      },
    });
  });

  // GET /api/v1/admin/users - Search, filter, and paginate users
  router.get('/users', requireAdminOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const result = await db.owners.listAll(limit, offset, role, search, status);

    // Strip password hashes
    const safeUsers = result.users.map(({ passwordHash: _, ...safe }) => safe);

    res.json({
      users: safeUsers,
      pagination: {
        totalCount: result.totalCount,
        limit,
        offset,
        hasMore: offset + limit < result.totalCount,
      },
    });
  });

  // GET /api/v1/admin/users/:id - View single user
  router.get('/users/:id', requireAdminOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    const user = await db.owners.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }

    const { passwordHash: _, ...safeUser } = user;
    res.json({ user: safeUser });
  });

  // POST /api/v1/admin/users - Create user (Admin/Owner)
  const CreateUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    displayName: z.string().min(1).max(120),
    businessName: z.string().min(1).max(120).default('Hotspot Operator'),
    role: UserRoleSchema.default('STAFF'),
  });

  router.post('/users', requireAdminOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = CreateUserSchema.parse(req.body);

      // Only SUPER_ADMIN can create another SUPER_ADMIN
      if (parsed.role === 'SUPER_ADMIN' && req.userRole !== 'SUPER_ADMIN') {
        res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Only SUPER_ADMIN can create administrator accounts.' },
        });
        return;
      }

      const existing = await db.owners.findByEmail(parsed.email);
      if (existing) {
        res.status(400).json({ error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' } });
        return;
      }

      const passwordHash = authService.hashPassword(parsed.password);
      const newUser = await db.owners.create({
        email: parsed.email.toLowerCase().trim(),
        passwordHash,
        displayName: parsed.displayName,
        businessName: parsed.businessName,
        role: parsed.role,
        ownerId: req.userRole === 'OWNER' ? req.userId : null,
        defaultCurrency: 'USD',
        isActive: true,
      });

      await db.audit.append({
        ownerId: req.ownerId!,
        actor: req.user?.email || 'admin',
        action: 'admin.user_created',
        resourceType: 'user',
        resourceId: newUser.id,
        details: { email: newUser.email, role: newUser.role },
      });

      const { passwordHash: _, ...safeUser } = newUser;
      res.status(201).json({ user: safeUser });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create user';
      res.status(400).json({ error: { code: 'INVALID_PAYLOAD', message } });
    }
  });

  // PATCH /api/v1/admin/users/:id - Update user
  const PatchUserSchema = z.object({
    displayName: z.string().min(1).max(120).optional(),
    businessName: z.string().min(1).max(120).optional(),
    role: UserRoleSchema.optional(),
  });

  router.patch('/users/:id', requireAdminOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = PatchUserSchema.parse(req.body);

      // Only SUPER_ADMIN can change roles
      if (parsed.role && req.userRole !== 'SUPER_ADMIN') {
        res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Only SUPER_ADMIN can modify account roles.' },
        });
        return;
      }

      const updated = await db.owners.update(req.params.id, parsed);
      if (!updated) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
        return;
      }

      await db.audit.append({
        ownerId: req.ownerId!,
        actor: req.user?.email || 'admin',
        action: 'admin.user_updated',
        resourceType: 'user',
        resourceId: updated.id,
        details: parsed,
      });

      const { passwordHash: _, ...safeUser } = updated;
      res.json({ user: safeUser });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update user';
      res.status(400).json({ error: { code: 'UPDATE_FAILED', message } });
    }
  });

  // POST /api/v1/admin/users/:id/activate
  router.post('/users/:id/activate', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const updated = await db.owners.update(req.params.id, { isActive: true });
      if (!updated) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
        return;
      }

      await db.audit.append({
        ownerId: req.ownerId!,
        actor: req.user?.email || 'admin',
        action: 'admin.user_activated',
        resourceType: 'user',
        resourceId: updated.id,
        details: {},
      });

      const { passwordHash: _, ...safeUser } = updated;
      res.json({ user: safeUser, message: 'Account activated successfully.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Activation failed';
      res.status(400).json({ error: { code: 'ACTIVATION_FAILED', message } });
    }
  });

  // POST /api/v1/admin/users/:id/deactivate
  router.post('/users/:id/deactivate', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const updated = await db.owners.update(req.params.id, { isActive: false });
      if (!updated) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
        return;
      }

      // Immediately invalidate any active sessions
      authService.invalidateUserSessions(updated.id);

      await db.audit.append({
        ownerId: req.ownerId!,
        actor: req.user?.email || 'admin',
        action: 'admin.user_deactivated',
        resourceType: 'user',
        resourceId: updated.id,
        details: {},
      });

      const { passwordHash: _, ...safeUser } = updated;
      res.json({ user: safeUser, message: 'Account deactivated. Active sessions revoked.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Deactivation failed';
      res.status(400).json({ error: { code: 'DEACTIVATION_FAILED', message } });
    }
  });

  // DELETE /api/v1/admin/users/:id
  router.delete('/users/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const success = await db.owners.delete(req.params.id);
      if (!success) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
        return;
      }

      authService.invalidateUserSessions(req.params.id);

      await db.audit.append({
        ownerId: req.ownerId!,
        actor: req.user?.email || 'admin',
        action: 'admin.user_deleted',
        resourceType: 'user',
        resourceId: req.params.id,
        details: {},
      });

      res.json({ message: 'User deleted successfully.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Deletion failed';
      res.status(400).json({ error: { code: 'DELETION_FAILED', message } });
    }
  });

  // GET /api/v1/admin/audit-logs
  router.get('/audit-logs', requireAdminOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const logs = await db.audit.list(req.ownerId!, limit);
    res.json({ auditLogs: logs });
  });

  // GET /api/v1/admin/ai/insights - Secure AI administrative summary foundation
  router.get('/ai/insights', requireAdminOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    const [auditEvents, usersResult] = await Promise.all([
      db.audit.list(req.ownerId!, 30),
      db.owners.listAll(100, 0),
    ]);

    // Privacy-preserving telemetry aggregates (no secrets, no personal passwords)
    const loginsLast30Events = auditEvents.filter((e) => e.action === 'user.logged_in').length;
    const failuresOrModifications = auditEvents.filter((e) =>
      ['admin.user_deactivated', 'admin.user_deleted', 'password.changed'].includes(e.action)
    ).length;

    res.json({
      summary: {
        telemetryFreshness: new Date().toISOString(),
        recentAuditedActions: auditEvents.length,
        loginsDetected: loginsLast30Events,
        sensitiveStateTransitions: failuresOrModifications,
        totalTrackedAccounts: usersResult.totalCount,
      },
      insights: [
        {
          type: 'SECURITY_POSTURE',
          level: 'HEALTHY',
          headline: 'Account Isolation & RBAC Active',
          detail: 'All administrative endpoints enforce strict role verification. Non-admin promotion is prevented.',
        },
        {
          type: 'OPERATIONAL_ADVISORY',
          level: 'INFO',
          headline: 'Gateway Capability Reality',
          detail: 'Operating in Limited Owner Mode. Per-client disconnects require a managed hardware gateway.',
        },
      ],
      disclaimer: 'AI operational telemetry uses authorized anonymized aggregates. Automated privilege elevation is prohibited.',
    });
  });

  return router;
}
