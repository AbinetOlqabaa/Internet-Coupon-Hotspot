import { z } from 'zod';
import { CurrencyCodeSchema, type CurrencyCode } from '../contracts/index.js';

export const PaymentProviderSchema = z.enum([
  'sandbox',
  'manual_cash',
  'stripe_webhook',
  'mpesa',
]);
export type PaymentProvider = z.infer<typeof PaymentProviderSchema>;

export const PaymentStatusSchema = z.enum([
  'pending',
  'requires_action',
  'completed',
  'failed',
  'refunded',
  'disputed',
]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export interface CreatePaymentIntentInput {
  ownerId: string;
  amountMinor: number;
  currency: CurrencyCode;
  provider?: string;
  idempotencyKey: string;
  sessionId?: string | null;
  customerId?: string | null;
  packageId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ManualCashPaymentInput {
  ownerId: string;
  actor: string;
  amountMinor: number;
  currency: CurrencyCode;
  idempotencyKey: string;
  sessionId?: string | null;
  customerId?: string | null;
  packageId?: string | null;
  referenceNote?: string | null;
}

export interface RefundPaymentInput {
  ownerId: string;
  paymentId: string;
  actor: string;
  amountMinor?: number;
  reason: string;
}

export interface DisputePaymentInput {
  ownerId: string;
  paymentId: string;
  actor: string;
  reason: string;
}

export interface WebhookEventPayload {
  id: string;
  type:
    | 'payment_intent.succeeded'
    | 'payment_intent.payment_failed'
    | 'payment_intent.requires_action'
    | 'charge.refunded'
    | 'charge.dispute.created';
  created: number;
  data: {
    paymentIntentId?: string;
    providerRef?: string;
    amountMinor: number;
    currency: CurrencyCode;
    status: PaymentStatus;
    metadata?: Record<string, unknown>;
  };
}

export interface ReconciliationReport {
  ownerId: string;
  reconciledAt: string;
  status: 'balanced' | 'discrepant';
  totalPaymentsCount: number;
  completedPaymentsCount: number;
  totalLedgerEntriesCount: number;
  paymentsSumMinor: number;
  ledgerSumMinor: number;
  discrepancyMinor: number;
  unmatchedPayments: Array<{
    id: string;
    amountMinor: number;
    currency: string;
    status: string;
    createdAt: string;
  }>;
  unmatchedLedgerEntries: Array<{
    id: string;
    referenceId: string | null;
    amountMinor: number;
    currency: string;
    entryType: string;
    createdAt: string;
  }>;
}
