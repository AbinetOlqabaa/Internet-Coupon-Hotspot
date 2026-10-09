import { Router, type Response } from 'express';
import { z } from 'zod';
import type { RepositoryRegistry } from '../db/repositories.js';
import type { AuthenticatedRequest } from '../auth/routes.js';
import { CurrencyCodeSchema } from '../contracts/index.js';

export function createOwnerRouter(db: RepositoryRegistry): Router {
  const router = Router();

  // GET /api/v1/owner/profile
  router.get('/profile', async (req: AuthenticatedRequest, res: Response) => {
    const ownerId = req.ownerId!;
    const owner = await db.owners.findById(ownerId);
    if (!owner) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Owner profile not found' } });
      return;
    }
    const { passwordHash: _, ...safeProfile } = owner;
    res.json({ profile: safeProfile });
  });

  // PUT /api/v1/owner/profile
  const UpdateProfileSchema = z.object({
    businessName: z.string().min(1).max(120).optional(),
    defaultCurrency: CurrencyCodeSchema.optional(),
  });

  router.put('/profile', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const parsed = UpdateProfileSchema.parse(req.body);
      const owner = await db.owners.findById(ownerId);
      if (!owner) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Owner not found' } });
        return;
      }

      if (parsed.businessName) owner.businessName = parsed.businessName;
      if (parsed.defaultCurrency) owner.defaultCurrency = parsed.defaultCurrency;
      owner.updatedAt = new Date().toISOString();

      await db.audit.append({
        ownerId,
        actor: owner.email,
        action: 'owner.profile_updated',
        resourceType: 'owner',
        resourceId: ownerId,
        details: parsed,
      });

      const { passwordHash: _, ...safeProfile } = owner;
      res.json({ profile: safeProfile });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid profile payload';
      res.status(400).json({ error: { code: 'INVALID_PAYLOAD', message } });
    }
  });

  // GET /api/v1/owner/dashboard
  router.get('/dashboard', async (req: AuthenticatedRequest, res: Response) => {
    const ownerId = req.ownerId!;
    const [packages, customers, sessions, ledgerEntries] = await Promise.all([
      db.packages.list(ownerId),
      db.customers.list(ownerId),
      db.sessions.list(ownerId),
      db.ledger.listByOwner(ownerId),
    ]);

    const activeSessions = sessions.filter((s) => s.status === 'active').length;
    const totalRevenueMinor = ledgerEntries
      .filter((e) => e.entryType === 'sale')
      .reduce((sum, e) => sum + e.amountMinor, 0);

    res.json({
      metrics: {
        totalPackages: packages.length,
        activePackages: packages.filter((p) => p.active).length,
        totalCustomers: customers.length,
        activeSessions,
        totalSessions: sessions.length,
        totalRevenueMinor,
        currency: 'USD',
      },
      status: {
        gatewayMode: 'limited_owner_mode',
        gatewayConnected: false,
        enforcementDisclosure:
          'Limited owner-management mode active. Per-client enforcement requires a compatible managed gateway.',
      },
    });
  });

  return router;
}
