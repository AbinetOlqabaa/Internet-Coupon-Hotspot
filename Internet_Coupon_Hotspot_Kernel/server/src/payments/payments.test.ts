import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { defaultDb } from '../db/repositories.js';
import { SandboxPaymentAdapter } from './adapters/sandbox.js';

describe('Phase 7: Payment Adapters, Signed Webhooks, Manual Cash, Ledger & Reconciliation', () => {
  let ownerAToken: string;
  let ownerAId: string;
  let ownerBToken: string;
  let ownerBId: string;
  let packageAId: string;
  let sessionAId: string;

  beforeEach(async () => {
    // Register Owner A
    const resA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `payments_owner_a_${Date.now()}@test.com`,
        password: 'Password123!',
        businessName: 'Hotspot Pay A',
      });
    expect(resA.status).toBe(201);
    ownerAToken = resA.body.token;
    ownerAId = resA.body.owner.id;

    // Register Owner B (for cross-tenant tests)
    const resB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `payments_owner_b_${Date.now()}@test.com`,
        password: 'Password123!',
        businessName: 'Hotspot Pay B',
      });
    expect(resB.status).toBe(201);
    ownerBToken = resB.body.token;
    ownerBId = resB.body.owner.id;

    // Create an access package for Owner A
    const pkgRes = await request(app)
      .post('/api/v1/packages')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        name: '1 Hour Standard',
        durationSeconds: 3600,
        priceMinor: 500, // $5.00
        currency: 'USD',
      });
    expect(pkgRes.status).toBe(201);
    packageAId = pkgRes.body.package.id;

    // Create an initial session awaiting payment
    const session = await defaultDb.sessions.create({
      ownerId: ownerAId,
      customerId: null,
      packageId: packageAId,
      status: 'awaiting_payment',
      durationSeconds: 3600,
      remainingSeconds: 3600,
      activatedAt: null,
      expiresAt: null,
      deviceMac: 'AA:BB:CC:11:22:33',
      clientIp: '192.168.1.101',
      gatewayId: null,
    });
    sessionAId = session.id;
  });

  describe('Idempotency & Payment Intent Creation', () => {
    it('creates a new payment intent and enforces idempotency on repeat requests', async () => {
      const idempotencyKey = `test_ik_${Date.now()}`;

      // First call
      const res1 = await request(app)
        .post('/api/v1/payments/intents')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          ownerId: ownerAId,
          amountMinor: 500,
          currency: 'USD',
          provider: 'sandbox',
          sessionId: sessionAId,
          idempotencyKey,
        });

      expect(res1.status).toBe(201);
      expect(res1.body.isExisting).toBe(false);
      expect(res1.body.payment.id).toBeDefined();
      expect(res1.body.payment.status).toBe('pending');
      expect(res1.body.checkoutUrl).toBeDefined();

      const paymentId = res1.body.payment.id;

      // Second call with identical key & parameters
      const res2 = await request(app)
        .post('/api/v1/payments/intents')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          ownerId: ownerAId,
          amountMinor: 500,
          currency: 'USD',
          provider: 'sandbox',
          sessionId: sessionAId,
          idempotencyKey,
        });

      expect(res2.status).toBe(200);
      expect(res2.body.isExisting).toBe(true);
      expect(res2.body.payment.id).toBe(paymentId);
    });

    it('rejects reusing an idempotency key with conflicting payment amounts (HTTP 409)', async () => {
      const idempotencyKey = `conflict_ik_${Date.now()}`;

      const res1 = await request(app)
        .post('/api/v1/payments/intents')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          ownerId: ownerAId,
          amountMinor: 500,
          currency: 'USD',
          idempotencyKey,
        });
      expect(res1.status).toBe(201);

      // Conflict: same key, different amount
      const res2 = await request(app)
        .post('/api/v1/payments/intents')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          ownerId: ownerAId,
          amountMinor: 1000,
          currency: 'USD',
          idempotencyKey,
        });
      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe('PAYMENT_INTENT_ERROR');
    });
  });

  describe('Manual Cash Transactions', () => {
    it('records manual counter cash with actor, receipt number, completed status, and general ledger entry', async () => {
      const idempotencyKey = `cash_ik_${Date.now()}`;

      const res = await request(app)
        .post('/api/v1/payments/manual-cash')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          amountMinor: 500,
          currency: 'USD',
          sessionId: sessionAId,
          referenceNote: 'Customer paid with $5 note at front desk',
          idempotencyKey,
        });

      expect(res.status).toBe(201);
      expect(res.body.payment.status).toBe('completed');
      expect(res.body.payment.provider).toBe('manual_cash');
      expect(res.body.receiptNumber).toMatch(/^CASH-\d{8}-[A-F0-9]{6}$/);
      expect(res.body.ledgerEntry.entryType).toBe('sale');
      expect(res.body.ledgerEntry.amountMinor).toBe(500);
      expect(res.body.ledgerEntry.account).toBe('cash');

      // Verify session transition to payment_verified
      const updatedSession = await defaultDb.sessions.findById(ownerAId, sessionAId);
      expect(updatedSession?.status).toBe('payment_verified');

      // Verify audit trail logged
      const audits = await defaultDb.audit.list(ownerAId);
      const cashAudit = audits.find((a) => a.action === 'payment.manual_cash_recorded');
      expect(cashAudit).toBeDefined();
      expect(cashAudit?.resourceId).toBe(res.body.payment.id);
    });
  });

  describe('Replay-Protected HMAC-SHA256 Signed Webhooks', () => {
    const webhookSecret = process.env.WEBHOOK_SECRET || 'dev_hotspot_webhook_secret';

    it('authenticates valid signed webhook, settles payment, posts ledger, and updates session state', async () => {
      // 1. Create a pending payment intent
      const createRes = await request(app)
        .post('/api/v1/payments/intents')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          ownerId: ownerAId,
          amountMinor: 1500,
          currency: 'USD',
          sessionId: sessionAId,
          idempotencyKey: `webhook_test_ik_${Date.now()}`,
        });
      expect(createRes.status).toBe(201);
      const payment = createRes.body.payment;

      // 2. Prepare valid signed webhook payload
      const timestamp = Math.floor(Date.now() / 1000);
      const webhookPayload = JSON.stringify({
        id: `evt_${Date.now()}`,
        type: 'payment_intent.succeeded',
        created: timestamp,
        data: {
          paymentIntentId: payment.id,
          amountMinor: 1500,
          currency: 'USD',
          status: 'completed',
        },
      });

      const signature = SandboxPaymentAdapter.generateSignature(webhookPayload, timestamp, webhookSecret);

      // 3. Post to public webhook endpoint
      const hookRes = await request(app)
        .post('/api/v1/payments/webhooks/sandbox')
        .set('Content-Type', 'application/json')
        .set('x-signature', signature)
        .set('x-timestamp', timestamp.toString())
        .send(webhookPayload);

      expect(hookRes.status).toBe(200);
      expect(hookRes.body.received).toBe(true);
      expect(hookRes.body.eventType).toBe('payment_intent.succeeded');

      // 4. Verify payment intent status updated to completed
      const verifiedPayment = await defaultDb.payments.findById(ownerAId, payment.id);
      expect(verifiedPayment?.status).toBe('completed');

      // 5. Verify ledger entry created
      const ledgerResult = await defaultDb.ledger.listByOwner(ownerAId);
      const ledgerEntry = ledgerResult.find((e) => e.referenceId === payment.id);
      expect(ledgerEntry).toBeDefined();
      expect(ledgerEntry?.entryType).toBe('sale');
      expect(ledgerEntry?.amountMinor).toBe(1500);

      // 6. Verify session transition to payment_verified
      const session = await defaultDb.sessions.findById(ownerAId, sessionAId);
      expect(session?.status).toBe('payment_verified');
    });

    it('rejects webhooks with expired timestamps to prevent replay attacks', async () => {
      // Timestamp from 10 minutes ago (> 300s tolerance)
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 600;
      const webhookPayload = JSON.stringify({
        id: `evt_replay_${Date.now()}`,
        type: 'payment_intent.succeeded',
        created: expiredTimestamp,
        data: { amountMinor: 1000, currency: 'USD', status: 'completed' },
      });

      const signature = SandboxPaymentAdapter.generateSignature(webhookPayload, expiredTimestamp, webhookSecret);

      const res = await request(app)
        .post('/api/v1/payments/webhooks/sandbox')
        .set('Content-Type', 'application/json')
        .set('x-signature', signature)
        .set('x-timestamp', expiredTimestamp.toString())
        .send(webhookPayload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('WEBHOOK_FAILED');
    });

    it('rejects webhooks with invalid HMAC signatures', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const webhookPayload = JSON.stringify({
        id: `evt_tamper_${Date.now()}`,
        type: 'payment_intent.succeeded',
        created: timestamp,
        data: { amountMinor: 1000, currency: 'USD', status: 'completed' },
      });

      const forgedSignature = 'bad_signature_deadbeef1234567890';

      const res = await request(app)
        .post('/api/v1/payments/webhooks/sandbox')
        .set('Content-Type', 'application/json')
        .set('x-signature', forgedSignature)
        .set('x-timestamp', timestamp.toString())
        .send(webhookPayload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('WEBHOOK_FAILED');
    });
  });

  describe('Refunds & Dispute States', () => {
    it('executes refunds, records negative ledger debit, transitions session state, and prevents double-refunds', async () => {
      // Create completed manual cash payment
      const cashRes = await request(app)
        .post('/api/v1/payments/manual-cash')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          amountMinor: 800,
          currency: 'USD',
          sessionId: sessionAId,
          referenceNote: 'Cash to refund',
          idempotencyKey: `cash_refund_test_${Date.now()}`,
        });
      expect(cashRes.status).toBe(201);
      const paymentId = cashRes.body.payment.id;

      // Execute refund
      const refundRes = await request(app)
        .post(`/api/v1/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          reason: 'Customer requested cancellation before connection',
        });

      expect(refundRes.status).toBe(200);
      expect(refundRes.body.payment.status).toBe('refunded');
      expect(refundRes.body.ledgerEntry.entryType).toBe('refund');
      expect(refundRes.body.ledgerEntry.amountMinor).toBe(-800); // negative debit

      // Verify session updated to refunded
      const session = await defaultDb.sessions.findById(ownerAId, sessionAId);
      expect(session?.status).toBe('refunded');

      // Attempt second refund on the same payment
      const duplicateRefund = await request(app)
        .post(`/api/v1/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          reason: 'Attempt duplicate refund',
        });
      expect(duplicateRefund.status).toBe(400);
      expect(duplicateRefund.body.error.code).toBe('REFUND_FAILED');
    });

    it('flags disputes on payments and sessions', async () => {
      const cashRes = await request(app)
        .post('/api/v1/payments/manual-cash')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          amountMinor: 600,
          currency: 'USD',
          sessionId: sessionAId,
          idempotencyKey: `cash_dispute_test_${Date.now()}`,
        });
      const paymentId = cashRes.body.payment.id;

      const disputeRes = await request(app)
        .post(`/api/v1/payments/${paymentId}/dispute`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          reason: 'Unauthorized payment dispute submitted by customer',
        });

      expect(disputeRes.status).toBe(200);
      expect(disputeRes.body.payment.status).toBe('disputed');

      const session = await defaultDb.sessions.findById(ownerAId, sessionAId);
      expect(session?.status).toBe('disputed');
    });
  });

  describe('Cross-Tenant Isolation & Financial Reconciliation', () => {
    it('isolates payments and ledger across different owners', async () => {
      // Create payment for Owner A
      await request(app)
        .post('/api/v1/payments/manual-cash')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          amountMinor: 1000,
          currency: 'USD',
          idempotencyKey: `iso_test_a_${Date.now()}`,
        });

      // Owner B checks payments list
      const resB = await request(app)
        .get('/api/v1/payments')
        .set('Authorization', `Bearer ${ownerBToken}`);

      expect(resB.status).toBe(200);
      expect(resB.body.payments.length).toBe(0);

      // Owner B checks ledger
      const ledgerB = await request(app)
        .get('/api/v1/payments/ledger')
        .set('Authorization', `Bearer ${ownerBToken}`);

      expect(ledgerB.status).toBe(200);
      expect(ledgerB.body.entries.length).toBe(0);
      expect(ledgerB.body.balance.netBalanceMinor).toBe(0);
    });

    it('performs financial ledger reconciliation and confirms balanced status', async () => {
      // Owner B records clean payment
      await request(app)
        .post('/api/v1/payments/manual-cash')
        .set('Authorization', `Bearer ${ownerBToken}`)
        .send({
          amountMinor: 2500,
          currency: 'USD',
          idempotencyKey: `reconcile_b_${Date.now()}`,
        });

      const reconcileRes = await request(app)
        .get('/api/v1/payments/reconcile')
        .set('Authorization', `Bearer ${ownerBToken}`);

      expect(reconcileRes.status).toBe(200);
      const report = reconcileRes.body.report;
      expect(report.status).toBe('balanced');
      expect(report.discrepancyMinor).toBe(0);
      expect(report.completedPaymentsCount).toBe(1);
      expect(report.paymentsSumMinor).toBe(2500);
      expect(report.ledgerSumMinor).toBe(2500);
      expect(report.unmatchedPayments.length).toBe(0);
      expect(report.unmatchedLedgerEntries.length).toBe(0);
    });
  });
});
