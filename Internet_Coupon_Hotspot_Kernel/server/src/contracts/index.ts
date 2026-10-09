import { z } from 'zod';

/**
 * Currency & Money Contracts
 * Money is strictly represented as integer minor units (e.g. cents) with an explicit ISO 4217 currency code.
 */
export const CurrencyCodeSchema = z.enum([
  'USD',
  'EUR',
  'GBP',
  'ETB',
  'KES',
  'UGX',
  'TZS',
  'NGN',
  'GHS',
  'ZAR',
]);

export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

export const MoneySchema = z.object({
  amountMinor: z.number().int().nonnegative('Amount in minor units must be non-negative integer'),
  currency: CurrencyCodeSchema,
});

export type Money = z.infer<typeof MoneySchema>;

export function formatMoney(money: Money, locale: string = 'en-US'): string {
  const major = money.amountMinor / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
  }).format(major);
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: Cannot add ${a.currency} and ${b.currency}`);
  }
  return {
    amountMinor: a.amountMinor + b.amountMinor,
    currency: a.currency,
  };
}

/**
 * Access Package Contract
 */
export const AccessPackageSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().min(1),
  name: z.string().min(1).max(64),
  durationSeconds: z.number().int().positive('Duration must be positive integer seconds'),
  price: MoneySchema,
  dataQuotaBytes: z.number().int().positive().nullable().optional(),
  speedLimitDownKbps: z.number().int().positive().nullable().optional(),
  speedLimitUpKbps: z.number().int().positive().nullable().optional(),
  active: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type AccessPackage = z.infer<typeof AccessPackageSchema>;

/**
 * Server-Authoritative Session State Machine
 */
export const SessionStateSchema = z.enum([
  'created',
  'awaiting_payment',
  'payment_verified',
  'activation_pending',
  'active',
  'expired',
  'activation_failed',
  'paused',
  'revoked',
  'cancelled',
  'refund_pending',
  'refunded',
  'disputed',
]);

export type SessionState = z.infer<typeof SessionStateSchema>;

/**
 * Allowed State Transitions
 */
export const VALID_SESSION_TRANSITIONS: Record<SessionState, SessionState[]> = {
  created: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['payment_verified', 'cancelled'],
  payment_verified: ['activation_pending', 'refund_pending'],
  activation_pending: ['active', 'activation_failed', 'refund_pending'],
  active: ['expired', 'paused', 'revoked', 'refund_pending', 'disputed'],
  paused: ['active', 'expired', 'revoked'],
  activation_failed: ['activation_pending', 'refund_pending'],
  expired: [], // Terminal normal
  revoked: ['refund_pending'], // Terminal/Administrative
  cancelled: [], // Terminal
  refund_pending: ['refunded', 'disputed'],
  refunded: [], // Terminal
  disputed: ['refunded', 'revoked'],
};

export function isValidSessionTransition(from: SessionState, to: SessionState): boolean {
  if (from === to) return true;
  const allowed = VALID_SESSION_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Gateway Capabilities & Reality Matrix
 */
export type GatewayMode = 'limited_owner_mode' | 'managed_gateway_mode';

export interface GatewayCapabilities {
  mode: GatewayMode;
  canAuthorizeAccess: boolean;
  canDisconnectClient: boolean;
  canLimitBandwidth: boolean;
  canMeasureTraffic: boolean;
  requiresHardwareGateway: boolean;
  disclosureStatement: string;
}

export function getGatewayCapabilities(mode: GatewayMode): GatewayCapabilities {
  if (mode === 'limited_owner_mode') {
    return {
      mode: 'limited_owner_mode',
      canAuthorizeAccess: false,
      canDisconnectClient: false,
      canLimitBandwidth: false,
      canMeasureTraffic: false,
      requiresHardwareGateway: false,
      disclosureStatement:
        'Standard Android hotspot mode cannot enforce per-client disconnections, speed tiers, or traffic metering without dedicated gateway hardware.',
    };
  }

  return {
    mode: 'managed_gateway_mode',
    canAuthorizeAccess: true,
    canDisconnectClient: true,
    canLimitBandwidth: true,
    canMeasureTraffic: true,
    requiresHardwareGateway: true,
    disclosureStatement:
      'Operating in managed gateway mode via compatible router or RADIUS server. Enforcement is confirmed via hardware telemetry.',
  };
}

/**
 * Privacy & Secret Redaction
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'authorization',
  'apikey',
  'api_key',
  'cookie',
  'privatekey',
  'cardnumber',
  'cvv',
]);

export function redactSensitiveData<T>(input: T): T {
  if (input === null || typeof input !== 'object') {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveData(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
    if (SENSITIVE_KEYS.has(normalizedKey)) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSensitiveData(value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}
