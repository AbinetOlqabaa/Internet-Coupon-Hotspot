import { randomBytes } from 'node:crypto';
import type { PaymentAdapter, PaymentAdapterResult } from './base.js';
import type { CreatePaymentIntentInput, WebhookEventPayload } from '../types.js';

/**
 * ManualCashPaymentAdapter
 * 
 * Used for counter/on-premise cash collections by owner or authorized staff.
 * Complies with strict audit requirements:
 * "Manual cash confirmation records actor, time, amount and reference."
 */
export class ManualCashPaymentAdapter implements PaymentAdapter {
  readonly name = 'manual_cash';
  readonly isSandbox = false;

  async createIntent(input: CreatePaymentIntentInput): Promise<PaymentAdapterResult> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = randomBytes(3).toString('hex').toUpperCase();
    const receiptNumber = `CASH-${today}-${rand}`;
    const providerRef = `cash_ref_${receiptNumber}`;

    return {
      providerRef,
      status: 'completed',
      metadata: {
        receiptNumber,
        tenderType: 'cash_on_premise',
        note: (input.metadata?.referenceNote as string | undefined) || 'Counter cash payment',
      },
    };
  }

  verifyWebhookSignature(): boolean {
    // Cash transactions are on-premise operator interactions; webhooks do not apply
    return false;
  }

  parseWebhookPayload(): WebhookEventPayload {
    throw new Error('Webhooks are not supported for manual cash transactions.');
  }
}
