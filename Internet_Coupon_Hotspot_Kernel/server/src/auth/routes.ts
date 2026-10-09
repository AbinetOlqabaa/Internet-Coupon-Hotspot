import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { z } from 'zod';
import type { AuthService } from './service.js';
import type { RepositoryRegistry } from '../db/repositories.js';
import type { OwnerEntity, UserRole } from '../db/schema.js';

export interface AuthenticatedRequest extends Request {
  ownerId?: string;
  userId?: string;
  user?: OwnerEntity;
  userRole?: UserRole;
}

export function createAuthRouter(authService: AuthService, db: RepositoryRegistry): Router {
  const router = Router();

  const RegisterSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    businessName: z.string().min(1).max(120),
    displayName: z.string().max(120).optional(),
    currency: z.enum(['USD', 'EUR', 'ETB', 'KES']).optional(),
  });

  const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  const ChangePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, 'New password must be at least 8 characters long'),
  });

  const ForgotPasswordSchema = z.object({
    email: z.string().email(),
  });

  const ResetPasswordSchema = z.object({
    token: z.string().min(1),
    newPassword: z.string().min(8, 'New password must be at least 8 characters long'),
  });

  // POST /api/v1/auth/register
  router.post('/register', async (req: Request, res: Response) => {
    try {
      const parsed = RegisterSchema.parse(req.body);
      const result = await authService.register(parsed);
      res.status(201).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      res.status(400).json({ error: { code: 'REGISTRATION_FAILED', message } });
    }
  });

  // POST /api/v1/auth/login
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const parsed = LoginSchema.parse(req.body);
      const result = await authService.login(parsed.email, parsed.password);
      res.status(200).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid credentials';
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message } });
    }
  });

  // GET /api/v1/auth/me
  router.get('/me', async (req: AuthenticatedRequest, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
      return;
    }

    const token = authHeader.slice(7);
    const ownerId = authService.validateToken(token);
    if (!ownerId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
      return;
    }

    const owner = await db.owners.findById(ownerId);
    if (!owner) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User account not found' } });
      return;
    }

    if (!owner.isActive) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Account is deactivated' } });
      return;
    }

    const { passwordHash: _, ...safeOwner } = owner;
    res.status(200).json({ owner: safeOwner });
  });

  // POST /api/v1/auth/logout
  router.post('/logout', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      authService.revokeToken(token);
    }
    res.status(200).json({ message: 'Logged out successfully' });
  });

  // POST /api/v1/auth/change-password (Authenticated)
  router.post('/change-password', async (req: AuthenticatedRequest, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const token = authHeader.slice(7);
    const userId = authService.validateToken(token);
    if (!userId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired session' } });
      return;
    }

    try {
      const parsed = ChangePasswordSchema.parse(req.body);
      await authService.changePassword(userId, parsed.currentPassword, parsed.newPassword);
      res.status(200).json({ message: 'Password changed successfully. Existing sessions have been invalidated.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to change password';
      res.status(400).json({ error: { code: 'PASSWORD_CHANGE_FAILED', message } });
    }
  });

  // POST /api/v1/auth/forgot-password (Public)
  router.post('/forgot-password', async (req: Request, res: Response) => {
    try {
      const parsed = ForgotPasswordSchema.parse(req.body);
      const result = await authService.forgotPassword(parsed.email);
      res.status(200).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid request';
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message } });
    }
  });

  // POST /api/v1/auth/reset-password (Public with Token)
  router.post('/reset-password', async (req: Request, res: Response) => {
    try {
      const parsed = ResetPasswordSchema.parse(req.body);
      await authService.resetPassword(parsed.token, parsed.newPassword);
      res.status(200).json({ message: 'Password reset successfully. You may now log in with your new credentials.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Password reset failed';
      res.status(400).json({ error: { code: 'RESET_FAILED', message } });
    }
  });

  return router;
}

export function createAuthMiddleware(authService: AuthService, db: RepositoryRegistry) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const token = authHeader.slice(7);
    const userId = authService.validateToken(token);
    if (!userId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Session expired or invalid' } });
      return;
    }

    const user = await db.owners.findById(userId);
    if (!user) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User account not found' } });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Account is deactivated' } });
      return;
    }

    req.userId = user.id;
    req.ownerId = user.ownerId || user.id;
    req.user = user;
    req.userRole = user.role;
    next();
  };
}

export function createRoleMiddleware(allowedRoles: UserRole[]): RequestHandler {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.userRole || !allowedRoles.includes(req.userRole)) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Requires one of roles: [${allowedRoles.join(', ')}]`,
        },
      });
      return;
    }
    next();
  };
}
