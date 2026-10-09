import { randomUUID } from 'node:crypto';
import type { RepositoryRegistry } from '../db/repositories.js';
import type { PaymentIntentEntity, LedgerEntryEntity } from '../db/schema.js';
import type {
  CreatePaymentIntentInput,
  ManualCashPaymentInput,
  RefundPaymentInput,
  DisputePaymentInput,
  ReconciliationReport,
  WebhookEventPayload,
} from './types.js';
import type { PaymentAdapter } from './adapters/base.js';
import { SandboxPaymentAdapter } from './adapters/sandbox.js';
import { ManualCashPaymentAdapter } from './adapters/manual-cash.js';

export class PaymentService {
  private adapters = new Map<string, PaymentAdapter>();

  constructor(private db: RepositoryRegistry) {
    this.registerAdapter(new SandboxPaymentAdapter());
    this.registerAdapter(new ManualCashPaymentAdapter());
  }

  registerAdapter(adapter: PaymentAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  getAdapter(name: string): PaymentAdapter {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new Error(`Payment adapter '${name}' is not registered or supported.`);
    }
    return adapter;
  }

  /**
   * Creates a payment intent with strict idempotency and provider orchestration
   */
  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<{
    payment: PaymentIntentEntity;
    checkoutUrl?: string;
    clientSecret?: string;
    isExisting: boolean;
  }> {
    // 1. Idempotency Check
    const existing = await this.db.payments.findByIdempotency(input.ownerId, input.idempotencyKey);
    if (existing) {
      // Guard against reusing the same idempotency key with conflicting amounts or currencies
      if (existing.amountMinor !== input.amountMinor || existing.currency !== input.currency) {
        throw new Error(
          `Idempotency conflict: Key '${input.idempotencyKey}' was already used with amount ${existing.amountMinor} ${existing.currency}.`
        );
      }
      return {
        payment: existing,
        checkoutUrl: (existing.metadata as Record<string, string>)?.checkoutUrl,
        clientSecret: (existing.metadata as Record<string, string>)?.clientSecret,
        isExisting: true,
      };
    }

    const providerName = input.provider || 'sandbox';
    const adapter = this.getAdapter(providerName);

    // 2. Delegate to Adapter
    const adapterResult = await adapter.createIntent(input);

    // 3. Persist Intent
    const payment = await this.db.payments.create({
      ownerId: input.ownerId,
      sessionId: input.sessionId ?? null,
      customerId: input.customerId ?? null,
      packageId: input.packageId ?? null,
      amountMinor: input.amountMinor,
      currency: input.currency,
      provider: providerName,
      status: adapterResult.status,
      providerRef: adapterResult.providerRef,
      idempotencyKey: input.idempotencyKey,
      receiptNumber: null,
      refundReason: null,
      metadata: {
        ...input.metadata,
        ...adapterResult.metadata,
        checkoutUrl: adapterResult.checkoutUrl,
        clientSecret: adapterResult.clientSecret,
      },
    });

    // 4. Handle Immediate Completion (e.g. simulated or zero-cost tests)
    if (payment.status === 'completed') {
      await this.handlePaymentCompletion(payment, input.metadata?.actor as string || 'system');
    }

    await this.db.audit.append({
      ownerId: input.ownerId,
      actor: (input.metadata?.actor as string) || 'customer',
      action: 'payment.intent_created',
      resourceType: 'payment_intent',
      resourceId: payment.id,
      details: {
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        provider: payment.provider,
        status: payment.status,
      },
    });

    return {
      payment,
      checkoutUrl: adapterResult.checkoutUrl,
      clientSecret: adapterResult.clientSecret,
      isExisting: false,
    };
  }

  /**
   * Records an on-premise manual cash transaction with mandatory actor, receipt, and ledger entry
   */
  async recordManualCashPayment(input: ManualCashPaymentInput): Promise<{
    payment: PaymentIntentEntity;
    ledgerEntry: LedgerEntryEntity;
    receiptNumber: string;
    isExisting: boolean;
  }> {
    // 1. Idempotency Check
    const existing = await this.db.payments.findByIdempotency(input.ownerId, input.idempotencyKey);
    if (existing) {
      if (existing.amountMinor !== input.amountMinor || existing.currency !== input.currency) {
        throw new Error(
          `Idempotency conflict: Key '${input.idempotencyKey}' was already used with amount ${existing.amountMinor} ${existing.currency}.`
        );
      }
      const allLedger = await this.db.ledger.listByOwner(input.ownerId);
      const existingLedger = allLedger.find((l) => l.referenceId === existing.id);
      return {
        payment: existing,
        ledgerEntry: existingLedger!,
        receiptNumber: existing.receiptNumber || 'N/A',
        isExisting: true,
      };
    }

    const adapter = this.getAdapter('manual_cash');
    const adapterResult = await adapter.createIntent({
      ownerId: input.ownerId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      provider: 'manual_cash',
      idempotencyKey: input.idempotencyKey,
      sessionId: input.sessionId,
      customerId: input.customerId,
      packageId: input.packageId,
      metadata: { referenceNote: input.referenceNote, actor: input.actor },
    });

    const receiptNumber = (adapterResult.metadata?.receiptNumber as string) || `CASH-${Date.now()}`;

    // 2. Persist Completed Payment Intent
    const payment = await this.db.payments.create({
      ownerId: input.ownerId,
      sessionId: input.sessionId ?? null,
      customerId: input.customerId ?? null,
      packageId: input.packageId ?? null,
      amountMinor: input.amountMinor,
      currency: input.currency,
      provider: 'manual_cash',
      status: 'completed',
      providerRef: adapterResult.providerRef,
      idempotencyKey: input.idempotencyKey,
      receiptNumber,
      refundReason: null,
      metadata: {
        actor: input.actor,
        referenceNote: input.referenceNote,
        ...adapterResult.metadata,
      },
    });

    // 3. Post to General Ledger
    const memo = `Manual cash collected: receipt ${receiptNumber}${
      input.referenceNote ? ' (' + input.referenceNote + ')' : ''
    }`;
    const ledgerEntry = await this.db.ledger.create({
      ownerId: input.ownerId,
      entryType: 'sale',
      amountMinor: input.amountMinor,
      currency: input.currency,
      referenceId: payment.id,
      description: memo,
      account: 'cash',
      actor: input.actor,
    });

    // 4. Coordinate Session Transition
    if (payment.sessionId) {
      await this.db.sessions.updateStatus(input.ownerId, payment.sessionId, 'payment_verified');
    }

    // 5. Tamper-evident Audit Trail
    await this.db.audit.append({
      ownerId: input.ownerId,
      actor: input.actor,
      action: 'payment.manual_cash_recorded',
      resourceType: 'payment_intent',
      resourceId: payment.id,
      details: {
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        receiptNumber,
        ledgerEntryId: ledgerEntry.id,
      },
    });

    return {
      payment,
      ledgerEntry,
      receiptNumber,
      isExisting: false,
    };
  }

  /**
   * Ingests, authenticates, and executes signed webhook events
   */
  async processWebhook(
    providerName: string,
    rawPayload: string,
    headers: Record<string, string | undefined>,
    webhookSecret: string
  ): Promise<{ handled: boolean; eventType: string; paymentId?: string }> {
    const adapter = this.getAdapter(providerName);

    const signature =
      headers['x-signature'] ||
      headers['x-hub-signature-256'] ||
      headers['stripe-signature'] ||
      '';
    const timestamp =
      headers['x-timestamp'] ||
      headers['x-webhook-timestamp'] ||
      '';

    const isValid = adapter.verifyWebhookSignature(rawPayload, signature, webhookSecret, timestamp);
    if (!isValid) {
      throw new Error('Invalid webhook signature or expired timestamp window.');
    }

    const event: WebhookEventPayload = adapter.parseWebhookPayload(rawPayload);

    if (event.type === 'payment_intent.succeeded') {
      let payment: PaymentIntentEntity | null = null;
      if (event.data.paymentIntentId) {
        payment = await this.db.payments.findByIdPublic(event.data.paymentIntentId);
      } else if (event.data.providerRef) {
        payment = await this.db.payments.findByProviderRef(providerName, event.data.providerRef);
      }

      if (!payment) {
        throw new Error(`Referenced payment intent not found for webhook event ${event.id}`);
      }

      // Idempotency: if already completed, do not double-book
      if (payment.status === 'completed') {
        return { handled: true, eventType: event.type, paymentId: payment.id };
      }

      // Security Check: Verify amount and currency match
      if (payment.amountMinor !== event.data.amountMinor || payment.currency !== event.data.currency) {
        await this.db.audit.append({
          ownerId: payment.ownerId,
          actor: `webhook:${providerName}`,
          action: 'payment.webhook_anomaly',
          resourceType: 'payment_intent',
          resourceId: payment.id,
          details: {
            expected: { amountMinor: payment.amountMinor, currency: payment.currency },
            received: { amountMinor: event.data.amountMinor, currency: event.data.currency },
          },
        });
        throw new Error('Webhook payload amount/currency does not match recorded payment intent.');
      }

      const updated = await this.db.payments.updateStatus(payment.ownerId, payment.id, 'completed');
      if (updated) {
        await this.handlePaymentCompletion(updated, `webhook:${providerName}`);
      }

      return { handled: true, eventType: event.type, paymentId: payment.id };
    }

    if (event.type === 'payment_intent.payment_failed') {
      let payment: PaymentIntentEntity | null = null;
      if (event.data.paymentIntentId) {
        payment = await this.db.payments.findByIdPublic(event.data.paymentIntentId);
      } else if (event.data.providerRef) {
        payment = await this.db.payments.findByProviderRef(providerName, event.data.providerRef);
      }

      if (payment && payment.status !== 'completed') {
        await this.db.payments.updateStatus(payment.ownerId, payment.id, 'failed');
        if (payment.sessionId) {
          await this.db.sessions.updateStatus(payment.ownerId, payment.sessionId, 'cancelled');
        }
      }
      return { handled: true, eventType: event.type, paymentId: payment?.id };
    }

    if (event.type === 'charge.dispute.created') {
      let payment: PaymentIntentEntity | null = null;
      if (event.data.paymentIntentId) {
        payment = await this.db.payments.findByIdPublic(event.data.paymentIntentId);
      } else if (event.data.providerRef) {
        payment = await this.db.payments.findByProviderRef(providerName, event.data.providerRef);
      }

      if (payment) {
        await this.disputePayment({
          ownerId: payment.ownerId,
          paymentId: payment.id,
          actor: `webhook:${providerName}`,
          reason: 'Chargeback dispute filed via provider',
        });
      }
      return { handled: true, eventType: event.type, paymentId: payment?.id };
    }

    return { handled: false, eventType: event.type };
  }

  /**
   * Internal completion hook: posts ledger entry, triggers session transition, writes audit
   */
  private async handlePaymentCompletion(payment: PaymentIntentEntity, actor: string): Promise<void> {
    // 1. Post to General Ledger
    await this.db.ledger.create({
      ownerId: payment.ownerId,
      entryType: 'sale',
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      referenceId: payment.id,
      description: `Payment settled via ${payment.provider}`,
      account: 'revenue',
      actor,
    });

    // 2. Advance Session to payment_verified
    if (payment.sessionId) {
      await this.db.sessions.updateStatus(payment.ownerId, payment.sessionId, 'payment_verified');
    }

    // 3. Audit Event
    await this.db.audit.append({
      ownerId: payment.ownerId,
      actor,
      action: 'payment.completed',
      resourceType: 'payment_intent',
      resourceId: payment.id,
      details: {
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        provider: payment.provider,
      },
    });
  }

  /**
   * Executes a full or partial refund with ledger debit and session state coordination
   */
  async refundPayment(input: RefundPaymentInput): Promise<{
    payment: PaymentIntentEntity;
    ledgerEntry: LedgerEntryEntity;
  }> {
    const payment = await this.db.payments.findById(input.ownerId, input.paymentId);
    if (!payment) {
      throw new Error(`Payment intent '${input.paymentId}' not found.`);
    }

    if (payment.status !== 'completed') {
      throw new Error(`Cannot refund payment in status '${payment.status}'. Only completed payments can be refunded.`);
    }

    const refundAmount = input.amountMinor ?? payment.amountMinor;
    if (refundAmount <= 0 || refundAmount > payment.amountMinor) {
      throw new Error(`Refund amount must be between 1 and ${payment.amountMinor} minor units.`);
    }

    // 1. Update Payment Status & Reason
    const updated = await this.db.payments.updateStatus(input.ownerId, payment.id, 'refunded', {
      refundReason: input.reason,
    });

    if (!updated) {
      throw new Error('Failed to update payment status during refund.');
    }

    // 2. Record Refund in General Ledger (negative minor units representing fund outflow)
    const ledgerEntry = await this.db.ledger.create({
      ownerId: input.ownerId,
      entryType: 'refund',
      amountMinor: -refundAmount,
      currency: payment.currency,
      referenceId: payment.id,
      description: `Refund: ${input.reason}`,
      account: 'refund_reserve',
      actor: input.actor,
    });

    // 3. Coordinate Session State Machine
    if (payment.sessionId) {
      const session = await this.db.sessions.findById(input.ownerId, payment.sessionId);
      if (session && session.status !== 'expired' && session.status !== 'refunded') {
        await this.db.sessions.updateStatus(input.ownerId, session.id, 'refunded');
      }
    }

    // 4. Audit Log
    await this.db.audit.append({
      ownerId: input.ownerId,
      actor: input.actor,
      action: 'payment.refunded',
      resourceType: 'payment_intent',
      resourceId: payment.id,
      details: {
        refundAmountMinor: refundAmount,
        currency: payment.currency,
        reason: input.reason,
        ledgerEntryId: ledgerEntry.id,
      },
    });

    return { payment: updated, ledgerEntry };
  }

  /**
   * Flags a payment and associated session as disputed
   */
  async disputePayment(input: DisputePaymentInput): Promise<PaymentIntentEntity> {
    const payment = await this.db.payments.findById(input.ownerId, input.paymentId);
    if (!payment) {
      throw new Error(`Payment intent '${input.paymentId}' not found.`);
    }

    const updated = await this.db.payments.updateStatus(input.ownerId, payment.id, 'disputed', {
      refundReason: `Disputed: ${input.reason}`,
    });

    if (payment.sessionId) {
      await this.db.sessions.updateStatus(input.ownerId, payment.sessionId, 'disputed');
    }

    await this.db.audit.append({
      ownerId: input.ownerId,
      actor: input.actor,
      action: 'payment.disputed',
      resourceType: 'payment_intent',
      resourceId: payment.id,
      details: { reason: input.reason },
    });

    return updated!;
  }

  /**
   * Comprehensive Reconciliation Audit between Payment Intents and General Ledger Entries
   */
  async reconcile(ownerId: string): Promise<ReconciliationReport> {
    const { payments } = await this.db.payments.list(ownerId, { limit: 1000 });
    const ledgerEntries = await this.db.ledger.listByOwner(ownerId);

    const ledgerByRef = new Map<string, LedgerEntryEntity[]>();
    for (const entry of ledgerEntries) {
      if (entry.referenceId) {
        const list = ledgerByRef.get(entry.referenceId) || [];
        list.push(entry);
        ledgerByRef.set(entry.referenceId, list);
      }
    }

    const unmatchedPayments: ReconciliationReport['unmatchedPayments'] = [];
    let completedPaymentsSum = 0;
    let completedCount = 0;

    for (const p of payments) {
      if (p.status === 'completed' || p.status === 'refunded') {
        completedCount++;
        completedPaymentsSum += p.amountMinor;

        const associatedLedger = ledgerByRef.get(p.id);
        if (!associatedLedger || associatedLedger.length === 0) {
          unmatchedPayments.push({
            id: p.id,
            amountMinor: p.amountMinor,
            currency: p.currency,
            status: p.status,
            createdAt: p.createdAt,
          });
        }
      }
    }

    const paymentIds = new Set(payments.map((p) => p.id));
    const unmatchedLedgerEntries: ReconciliationReport['unmatchedLedgerEntries'] = [];
    let ledgerSum = 0;

    for (const l of ledgerEntries) {
      if (l.entryType === 'sale') {
        ledgerSum += l.amountMinor;
      }
      if (l.referenceId && !paymentIds.has(l.referenceId)) {
        unmatchedLedgerEntries.push({
          id: l.id,
          referenceId: l.referenceId,
          amountMinor: l.amountMinor,
          currency: l.currency,
          entryType: l.entryType,
          createdAt: l.createdAt,
        });
      }
    }

    const discrepancy = completedPaymentsSum - ledgerSum;
    const isBalanced =
      discrepancy === 0 &&
      unmatchedPayments.length === 0 &&
      unmatchedLedgerEntries.length === 0;

    return {
      ownerId,
      reconciledAt: new Date().toISOString(),
      status: isBalanced ? 'balanced' : 'discrepant',
      totalPaymentsCount: payments.length,
      completedPaymentsCount: completedCount,
      totalLedgerEntriesCount: ledgerEntries.length,
      paymentsSumMinor: completedPaymentsSum,
      ledgerSumMinor: ledgerSum,
      discrepancyMinor: discrepancy,
      unmatchedPayments,
      unmatchedLedgerEntries,
    };
  }
}
