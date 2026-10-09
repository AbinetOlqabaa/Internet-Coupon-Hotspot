import type { CreatePaymentIntentInput, WebhookEventPayload } from '../types.js';

export interface PaymentAdapterResult {
  providerRef: string;
  status: 'pending' | 'requires_action' | 'completed' | 'failed';
  clientSecret?: string;
  checkoutUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentAdapter {
  readonly name: string;
  readonly isSandbox: boolean;
  createIntent(input: CreatePaymentIntentInput): Promise<PaymentAdapterResult>;
  verifyWebhookSignature(payload: string, signature: string, secret: string, timestamp?: string): boolean;
  parseWebhookPayload(rawPayload: string): WebhookEventPayload;
}
