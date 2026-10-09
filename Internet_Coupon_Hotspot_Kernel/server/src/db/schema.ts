import { z } from 'zod';
import { CurrencyCodeSchema } from '../contracts/index.js';

export const UserRoleSchema = z.enum(['SUPER_ADMIN', 'OWNER', 'STAFF', 'CUSTOMER']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const OwnerEntitySchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  passwordHash: z.string().min(1),
  businessName: z.string().min(1).max(120),
  displayName: z.string().max(120).nullable().optional(),
  role: UserRoleSchema.default('OWNER'),
  ownerId: z.string().uuid().nullable().optional(),
  defaultCurrency: CurrencyCodeSchema,
  isActive: z.boolean().default(true),
  lastLoginAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type OwnerEntity = z.infer<typeof OwnerEntitySchema>;
export type UserEntity = OwnerEntity;

export const CustomerEntitySchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  phone: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  deviceMac: z.string().nullable().optional(),
  consentAcceptedAt: z.string().datetime().nullable().optional(),
  dataRetentionConsent: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CustomerEntity = z.infer<typeof CustomerEntitySchema>;

export const PackageEntitySchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  name: z.string().min(1).max(64),
  durationSeconds: z.number().int().positive(),
  priceMinor: z.number().int().nonnegative(),
  currency: CurrencyCodeSchema,
  dataQuotaBytes: z.number().int().positive().nullable().optional(),
  speedLimitDownKbps: z.number().int().positive().nullable().optional(),
  speedLimitUpKbps: z.number().int().positive().nullable().optional(),
  active: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PackageEntity = z.infer<typeof PackageEntitySchema>;

export const CouponEntitySchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  code: z.string().min(1).max(32),
  packageId: z.string().uuid(),
  maxUses: z.number().int().positive().default(1),
  currentUses: z.number().int().nonnegative().default(0),
  expiresAt: z.string().datetime().nullable().optional(),
  active: z.boolean().default(true),
  createdAt: z.string().datetime(),
});
export type CouponEntity = z.infer<typeof CouponEntitySchema>;

export const SessionEntitySchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  customerId: z.string().uuid().nullable().optional(),
  packageId: z.string().uuid(),
  status: z.enum([
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
  ]),
  durationSeconds: z.number().int().positive(),
  remainingSeconds: z.number().int().nonnegative(),
  activatedAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  deviceMac: z.string().nullable().optional(),
  clientIp: z.string().nullable().optional(),
  gatewayId: z.string().uuid().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SessionEntity = z.infer<typeof SessionEntitySchema>;

export const PaymentIntentEntitySchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  sessionId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  packageId: z.string().uuid().nullable().optional(),
  amountMinor: z.number().int().nonnegative(),
  currency: CurrencyCodeSchema,
  provider: z.string().min(1),
  status: z.enum(['pending', 'requires_action', 'completed', 'failed', 'refunded', 'disputed']),
  providerRef: z.string().nullable().optional(),
  idempotencyKey: z.string().min(1),
  receiptNumber: z.string().nullable().optional(),
  refundReason: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PaymentIntentEntity = z.infer<typeof PaymentIntentEntitySchema>;

export const LedgerEntryEntitySchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  entryType: z.enum(['sale', 'refund', 'adjustment']),
  amountMinor: z.number().int(),
  currency: CurrencyCodeSchema,
  referenceId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  account: z.string().optional(),
  actor: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type LedgerEntryEntity = z.infer<typeof LedgerEntryEntitySchema>;

export const AuditEventEntitySchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  actor: z.string().min(1),
  action: z.string().min(1),
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  details: z.record(z.string(), z.unknown()),
  ipAddress: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type AuditEventEntity = z.infer<typeof AuditEventEntitySchema>;

export const PasswordResetTokenEntitySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  tokenHash: z.string().min(1),
  expiresAt: z.string().datetime(),
  usedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type PasswordResetTokenEntity = z.infer<typeof PasswordResetTokenEntitySchema>;
