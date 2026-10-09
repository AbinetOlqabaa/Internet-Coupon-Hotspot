import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import type { RepositoryRegistry } from '../db/repositories.js';
import type { AuthenticatedRequest } from '../auth/routes.js';

export function createCouponRouter(db: RepositoryRegistry, authMiddleware: RequestHandler): Router {
  const router = Router();

  const CreateCouponSchema = z.object({
    code: z
      .string()
      .min(3)
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/, 'Coupon code must be alphanumeric (hyphens/underscores allowed)'),
    packageId: z.string().uuid(),
    maxUses: z.number().int().positive().default(1),
    expiresAt: z.string().datetime().nullable().optional(),
    active: z.boolean().default(true),
  });

  const ValidateCouponSchema = z.object({
    ownerId: z.string().uuid(),
    code: z.string().min(1).max(32),
  });

  // POST /api/v1/coupons/validate - Public voucher redemption validation with abuse checks
  router.post('/validate', async (req: Request, res: Response) => {
    try {
      const parsed = ValidateCouponSchema.parse(req.body);
      const coupon = await db.coupons.findByCode(parsed.ownerId, parsed.code);

      if (!coupon) {
        res.status(404).json({
          valid: false,
          error: { code: 'COUPON_NOT_FOUND', message: 'Voucher code is invalid or unrecognized.' },
        });
        return;
      }

      if (!coupon.active) {
        res.status(400).json({
          valid: false,
          error: { code: 'COUPON_INACTIVE', message: 'This voucher has been deactivated.' },
        });
        return;
      }

      // Expiry check
      if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
        res.status(400).json({
          valid: false,
          error: { code: 'COUPON_EXPIRED', message: 'This voucher has expired.' },
        });
        return;
      }

      // Max uses check
      if (coupon.currentUses >= coupon.maxUses) {
        res.status(400).json({
          valid: false,
          error: { code: 'COUPON_EXHAUSTED', message: 'This voucher has already reached its maximum usage limit.' },
        });
        return;
      }

      // Fetch package pricing snapshot
      const pkg = await db.packages.findById(parsed.ownerId, coupon.packageId);
      if (!pkg || !pkg.active) {
        res.status(400).json({
          valid: false,
          error: { code: 'PACKAGE_INACTIVE', message: 'The access package associated with this voucher is unavailable.' },
        });
        return;
      }

      res.json({
        valid: true,
        coupon: {
          id: coupon.id,
          code: coupon.code,
          remainingUses: coupon.maxUses - coupon.currentUses,
        },
        packageSnapshot: {
          id: pkg.id,
          name: pkg.name,
          durationSeconds: pkg.durationSeconds,
          priceMinor: pkg.priceMinor,
          currency: pkg.currency,
          dataQuotaBytes: pkg.dataQuotaBytes,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid validation request';
      res.status(400).json({ valid: false, error: { code: 'INVALID_REQUEST', message } });
    }
  });

  // Protected Owner Routes
  router.use(authMiddleware);

  // POST /api/v1/coupons - Create coupon
  router.post('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const parsed = CreateCouponSchema.parse(req.body);

      const pkg = await db.packages.findById(ownerId, parsed.packageId);
      if (!pkg) {
        res.status(404).json({ error: { code: 'PACKAGE_NOT_FOUND', message: 'Referenced package not found' } });
        return;
      }

      const coupon = await db.coupons.create({
        ownerId,
        code: parsed.code.toUpperCase(),
        packageId: parsed.packageId,
        maxUses: parsed.maxUses,
        currentUses: 0,
        expiresAt: parsed.expiresAt || null,
        active: parsed.active,
      });

      await db.audit.append({
        ownerId,
        actor: req.ownerId!,
        action: 'coupon.created',
        resourceType: 'coupon',
        resourceId: coupon.id,
        details: { code: coupon.code, maxUses: coupon.maxUses, packageId: coupon.packageId },
      });

      res.status(201).json({ coupon });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create coupon';
      res.status(400).json({ error: { code: 'INVALID_PAYLOAD', message } });
    }
  });

  // GET /api/v1/coupons - List coupons
  router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    const ownerId = req.ownerId!;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const result = await db.coupons.list(ownerId, limit, offset);
    res.json({
      coupons: result.coupons,
      pagination: {
        totalCount: result.totalCount,
        limit,
        offset,
        hasMore: offset + limit < result.totalCount,
      },
    });
  });

  return router;
}
