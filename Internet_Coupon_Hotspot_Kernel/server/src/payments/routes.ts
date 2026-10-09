import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import type { RepositoryRegistry } from '../db/repositories.js';
import type { AuthenticatedRequest } from '../auth/routes.js';
import { CurrencyCodeSchema } from '../contracts/index.js';
import type { PaymentService } from './service.js';

export function createPaymentRouter(
  db: RepositoryRegistry,
  paymentService: PaymentService,
  authMiddleware: RequestHandler
): Router {
  const router = Router();

  const CreateIntentSchema = z.object({
    ownerId: z.string().uuid().optional(),
    amountMinor: z.number().int().positive('Amount must be positive integer minor units'),
    currency: CurrencyCodeSchema.default('USD'),
    provider: z.string().default('sandbox'),
    idempotencyKey: z.string().min(1).max(128).optional(),
    sessionId: z.string().uuid().nullable().optional(),
    customerId: z.string().uuid().nullable().optional(),
    packageId: z.string().uuid().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  });

  const ManualCashSchema = z.object({
    amountMinor: z.number().int().positive('Amount must be positive integer minor units'),
    currency: CurrencyCodeSchema.default('USD'),
    sessionId: z.string().uuid().nullable().optional(),
    customerId: z.string().uuid().nullable().optional(),
    packageId: z.string().uuid().nullable().optional(),
    referenceNote: z.string().max(256).nullable().optional(),
    idempotencyKey: z.string().min(1).max(128).optional(),
  });

  const RefundSchema = z.object({
    amountMinor: z.number().int().positive().optional(),
    reason: z.string().min(3).max(256),
  });

  const DisputeSchema = z.object({
    reason: z.string().min(3).max(256),
  });

  // POST /api/v1/payments/webhooks/:provider - Public Signed Webhook Ingestion
  router.post('/webhooks/:provider', async (req: Request, res: Response) => {
    try {
      const provider = req.params.provider;
      const secret = process.env.WEBHOOK_SECRET || 'dev_hotspot_webhook_secret';
      const rawPayload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

      const headers: Record<string, string | undefined> = {};
      for (const [key, val] of Object.entries(req.headers)) {
        headers[key.toLowerCase()] = Array.isArray(val) ? val[0] : val;
      }

      const result = await paymentService.processWebhook(provider, rawPayload, headers, secret);
      res.json({ received: true, ...result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Webhook processing error';
      res.status(400).json({ error: { code: 'WEBHOOK_FAILED', message } });
    }
  });

  // GET /api/v1/payments/intents/:id - Lookup intent status (Public / Customer check)
  router.get('/intents/:id', async (req: Request, res: Response) => {
    try {
      const payment = await db.payments.findByIdPublic(req.params.id);
      if (!payment) {
        res.status(404).json({ error: { code: 'PAYMENT_NOT_FOUND', message: 'Payment intent not found.' } });
        return;
      }
      res.json({
        payment: {
          id: payment.id,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          provider: payment.provider,
          status: payment.status,
          providerRef: payment.providerRef,
          receiptNumber: payment.receiptNumber,
          createdAt: payment.createdAt,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lookup failed';
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message } });
    }
  });

  // POST /api/v1/payments/intents - Create payment intent (Public customer portal or authenticated owner)
  router.post('/intents', async (req: Request, res: Response) => {
    try {
      const parsed = CreateIntentSchema.parse(req.body);
      const idempotencyKey =
        (req.headers['idempotency-key'] as string | undefined) ||
        parsed.idempotencyKey ||
        `auto_ik_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // Resolve ownerId from auth context if available or body
      const ownerId = (req as AuthenticatedRequest).ownerId || parsed.ownerId;
      if (!ownerId) {
        res.status(400).json({
          error: { code: 'MISSING_OWNER', message: 'ownerId is required to create a payment intent.' },
        });
        return;
      }

      const result = await paymentService.createPaymentIntent({
        ownerId,
        amountMinor: parsed.amountMinor,
        currency: parsed.currency,
        provider: parsed.provider,
        idempotencyKey,
        sessionId: parsed.sessionId,
        customerId: parsed.customerId,
        packageId: parsed.packageId,
        metadata: parsed.metadata,
      });

      res.status(result.isExisting ? 200 : 201).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid payment intent payload';
      const status = message.includes('Idempotency conflict') ? 409 : 400;
      res.status(status).json({ error: { code: 'PAYMENT_INTENT_ERROR', message } });
    }
  });

  // Authenticated Owner Endpoints Below
  router.use(authMiddleware);

  // POST /api/v1/payments/manual-cash - Record Counter Cash Payment
  router.post('/manual-cash', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const parsed = ManualCashSchema.parse(req.body);
      const idempotencyKey =
        (req.headers['idempotency-key'] as string | undefined) ||
        parsed.idempotencyKey ||
        `cash_ik_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const actor = req.user?.email || req.userId || 'owner';

      const result = await paymentService.recordManualCashPayment({
        ownerId,
        actor,
        amountMinor: parsed.amountMinor,
        currency: parsed.currency,
        idempotencyKey,
        sessionId: parsed.sessionId,
        customerId: parsed.customerId,
        packageId: parsed.packageId,
        referenceNote: parsed.referenceNote,
      });

      res.status(result.isExisting ? 200 : 201).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid cash payment payload';
      const status = message.includes('Idempotency conflict') ? 409 : 400;
      res.status(status).json({ error: { code: 'CASH_PAYMENT_ERROR', message } });
    }
  });

  // GET /api/v1/payments - List payments for authenticated owner
  router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
      const limit = req.query.limit ? Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10))) : 50;
      const offset = req.query.offset ? Math.max(0, parseInt(req.query.offset as string, 10)) : 0;

      const result = await db.payments.list(ownerId, { status, provider, limit, offset });
      res.json({
        payments: result.payments,
        pagination: {
          total: result.totalCount,
          limit,
          offset,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to retrieve payments';
      res.status(500).json({ error: { code: 'PAYMENTS_FETCH_FAILED', message } });
    }
  });

  // GET /api/v1/payments/ledger - List ledger entries & balance
  router.get('/ledger', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const entryType = typeof req.query.entryType === 'string' ? req.query.entryType : undefined;
      const limit = req.query.limit ? Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10))) : 50;
      const offset = req.query.offset ? Math.max(0, parseInt(req.query.offset as string, 10)) : 0;

      const allEntries = await db.ledger.listByOwner(ownerId);
      const filtered = allEntries
        .filter((e) => !entryType || e.entryType === entryType)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const balance = await db.ledger.getBalance(ownerId);

      res.json({
        entries: filtered.slice(offset, offset + limit),
        balance,
        pagination: {
          total: filtered.length,
          limit,
          offset,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to retrieve ledger';
      res.status(500).json({ error: { code: 'LEDGER_FETCH_FAILED', message } });
    }
  });

  // GET /api/v1/payments/reconcile - Run ledger reconciliation audit
  router.get('/reconcile', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const report = await paymentService.reconcile(ownerId);
      res.json({ report });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to run reconciliation';
      res.status(500).json({ error: { code: 'RECONCILIATION_FAILED', message } });
    }
  });

  // POST /api/v1/payments/:id/refund - Process refund
  router.post('/:id/refund', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const paymentId = req.params.id;
      const parsed = RefundSchema.parse(req.body);
      const actor = req.user?.email || req.userId || 'owner';

      const result = await paymentService.refundPayment({
        ownerId,
        paymentId,
        actor,
        amountMinor: parsed.amountMinor,
        reason: parsed.reason,
      });

      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Refund failed';
      res.status(400).json({ error: { code: 'REFUND_FAILED', message } });
    }
  });

  // POST /api/v1/payments/:id/dispute - Flag dispute
  router.post('/:id/dispute', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const paymentId = req.params.id;
      const parsed = DisputeSchema.parse(req.body);
      const actor = req.user?.email || req.userId || 'owner';

      const payment = await paymentService.disputePayment({
        ownerId,
        paymentId,
        actor,
        reason: parsed.reason,
      });

      res.json({ payment });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Dispute flagging failed';
      res.status(400).json({ error: { code: 'DISPUTE_FAILED', message } });
    }
  });

  return router;
}
