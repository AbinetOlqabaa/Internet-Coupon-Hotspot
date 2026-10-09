import { Router, type Response } from 'express';
import { z } from 'zod';
import type { RepositoryRegistry } from '../db/repositories.js';
import type { AuthenticatedRequest } from '../auth/routes.js';
import { CurrencyCodeSchema } from '../contracts/index.js';

export function createPackageRouter(db: RepositoryRegistry): Router {
  const router = Router();

  const CreatePackageSchema = z.object({
    name: z.string().min(1).max(64),
    durationSeconds: z.number().int().positive('Duration must be positive seconds (e.g. 1800 for 30m, 3600 for 1h)'),
    priceMinor: z.number().int().nonnegative('Price in minor units must be non-negative'),
    currency: CurrencyCodeSchema.default('USD'),
    dataQuotaBytes: z.number().int().positive().nullable().optional(),
    speedLimitDownKbps: z.number().int().positive().nullable().optional(),
    speedLimitUpKbps: z.number().int().positive().nullable().optional(),
    active: z.boolean().default(true),
  });

  const UpdatePackageSchema = z.object({
    name: z.string().min(1).max(64).optional(),
    priceMinor: z.number().int().nonnegative().optional(),
    currency: CurrencyCodeSchema.optional(),
    dataQuotaBytes: z.number().int().positive().nullable().optional(),
    speedLimitDownKbps: z.number().int().positive().nullable().optional(),
    speedLimitUpKbps: z.number().int().positive().nullable().optional(),
    active: z.boolean().optional(),
  });

  // POST /api/v1/packages - Create package
  router.post('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const parsed = CreatePackageSchema.parse(req.body);

      const pkg = await db.packages.create({
        ownerId,
        name: parsed.name,
        durationSeconds: parsed.durationSeconds,
        priceMinor: parsed.priceMinor,
        currency: parsed.currency,
        dataQuotaBytes: parsed.dataQuotaBytes,
        speedLimitDownKbps: parsed.speedLimitDownKbps,
        speedLimitUpKbps: parsed.speedLimitUpKbps,
        active: parsed.active,
      });

      await db.audit.append({
        ownerId,
        actor: req.ownerId!,
        action: 'package.created',
        resourceType: 'package',
        resourceId: pkg.id,
        details: { name: pkg.name, priceMinor: pkg.priceMinor, durationSeconds: pkg.durationSeconds },
      });

      res.status(201).json({ package: pkg });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid package creation payload';
      res.status(400).json({ error: { code: 'INVALID_PAYLOAD', message } });
    }
  });

  // GET /api/v1/packages - List packages
  router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    const ownerId = req.ownerId!;
    const activeOnly = req.query.activeOnly === 'true';
    const packages = await db.packages.list(ownerId, activeOnly);
    res.json({ packages });
  });

  // GET /api/v1/packages/:id - Get package
  router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
    const ownerId = req.ownerId!;
    const pkg = await db.packages.findById(ownerId, req.params.id);
    if (!pkg) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Package not found' } });
      return;
    }
    res.json({ package: pkg });
  });

  // PUT /api/v1/packages/:id - Update package (edits do not alter historical session snapshots)
  router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const parsed = UpdatePackageSchema.parse(req.body);

      const updated = await db.packages.update(ownerId, req.params.id, parsed);
      if (!updated) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Package not found' } });
        return;
      }

      await db.audit.append({
        ownerId,
        actor: req.ownerId!,
        action: 'package.updated',
        resourceType: 'package',
        resourceId: updated.id,
        details: parsed,
      });

      res.json({ package: updated });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid package update payload';
      res.status(400).json({ error: { code: 'INVALID_PAYLOAD', message } });
    }
  });

  return router;
}
