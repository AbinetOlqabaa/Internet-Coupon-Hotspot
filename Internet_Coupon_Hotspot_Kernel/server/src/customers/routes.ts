import { Router, type Response } from 'express';
import { z } from 'zod';
import type { RepositoryRegistry } from '../db/repositories.js';
import type { AuthenticatedRequest } from '../auth/routes.js';

export function createCustomerRouter(db: RepositoryRegistry): Router {
  const router = Router();

  const CreateCustomerSchema = z.object({
    phone: z.string().max(32).optional(),
    displayName: z.string().max(100).optional(),
    deviceMac: z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, 'Invalid MAC address').optional(),
    consentAccepted: z.boolean().default(true),
    dataRetentionConsent: z.boolean().default(true),
  });

  const UpdateCustomerSchema = z.object({
    phone: z.string().max(32).optional(),
    displayName: z.string().max(100).optional(),
    deviceMac: z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, 'Invalid MAC address').optional(),
    dataRetentionConsent: z.boolean().optional(),
  });

  // POST /api/v1/customers - Create customer with consent
  router.post('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const parsed = CreateCustomerSchema.parse(req.body);

      const customer = await db.customers.create({
        ownerId,
        phone: parsed.phone || null,
        displayName: parsed.displayName || null,
        deviceMac: parsed.deviceMac?.toUpperCase() || null,
        consentAcceptedAt: parsed.consentAccepted ? new Date().toISOString() : null,
        dataRetentionConsent: parsed.dataRetentionConsent,
      });

      await db.audit.append({
        ownerId,
        actor: req.ownerId!,
        action: 'customer.created',
        resourceType: 'customer',
        resourceId: customer.id,
        details: { phone: parsed.phone, deviceMac: parsed.deviceMac },
      });

      res.status(201).json({ customer });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid customer payload';
      res.status(400).json({ error: { code: 'INVALID_PAYLOAD', message } });
    }
  });

  // GET /api/v1/customers - Search and Paginate
  router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    const ownerId = req.ownerId!;
    const query = typeof req.query.query === 'string' ? req.query.query : undefined;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const result = await db.customers.searchAndPaginate(ownerId, query, limit, offset);
    res.json({
      customers: result.customers,
      pagination: {
        totalCount: result.totalCount,
        limit,
        offset,
        hasMore: offset + limit < result.totalCount,
      },
    });
  });

  // GET /api/v1/customers/:id - Details and session history
  router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
    const ownerId = req.ownerId!;
    const customer = await db.customers.findById(ownerId, req.params.id);
    if (!customer) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Customer not found' } });
      return;
    }

    const sessions = await db.sessions.listByCustomer(ownerId, customer.id);

    res.json({
      customer,
      sessionHistory: sessions,
    });
  });

  // PUT /api/v1/customers/:id - Update customer
  router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const parsed = UpdateCustomerSchema.parse(req.body);
      const updated = await db.customers.update(ownerId, req.params.id, {
        ...(parsed.phone !== undefined ? { phone: parsed.phone } : {}),
        ...(parsed.displayName !== undefined ? { displayName: parsed.displayName } : {}),
        ...(parsed.deviceMac !== undefined ? { deviceMac: parsed.deviceMac.toUpperCase() } : {}),
        ...(parsed.dataRetentionConsent !== undefined ? { dataRetentionConsent: parsed.dataRetentionConsent } : {}),
      });

      if (!updated) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Customer not found' } });
        return;
      }

      await db.audit.append({
        ownerId,
        actor: req.ownerId!,
        action: 'customer.updated',
        resourceType: 'customer',
        resourceId: updated.id,
        details: parsed,
      });

      res.json({ customer: updated });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid customer update';
      res.status(400).json({ error: { code: 'INVALID_PAYLOAD', message } });
    }
  });

  // DELETE /api/v1/customers/:id - Privacy deletion
  router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
    const ownerId = req.ownerId!;
    const deleted = await db.customers.delete(ownerId, req.params.id);
    if (!deleted) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Customer not found' } });
      return;
    }

    await db.audit.append({
      ownerId,
      actor: req.ownerId!,
      action: 'customer.deleted',
      resourceType: 'customer',
      resourceId: req.params.id,
      details: { privacyDeletion: true },
    });

    res.json({ message: 'Customer deleted successfully' });
  });

  return router;
}
