import { describe, it, expect } from 'vitest';
import {
  MoneySchema,
  formatMoney,
  addMoney,
  isValidSessionTransition,
  getGatewayCapabilities,
  redactSensitiveData,
  AccessPackageSchema,
} from './index.js';

describe('Phase 1: Product Contracts & Currency Math', () => {
  it('validates money with integer minor units', () => {
    const valid = MoneySchema.parse({ amountMinor: 2500, currency: 'USD' });
    expect(valid.amountMinor).toBe(2500);
    expect(valid.currency).toBe('USD');

    // Rejects floating point minor units
    expect(() => MoneySchema.parse({ amountMinor: 25.5, currency: 'USD' })).toThrow();

    // Rejects negative minor units
    expect(() => MoneySchema.parse({ amountMinor: -100, currency: 'USD' })).toThrow();
  });

  it('formats money and performs integer currency arithmetic safely', () => {
    const formatted = formatMoney({ amountMinor: 1550, currency: 'USD' });
    expect(formatted).toContain('15.50');

    const sum = addMoney(
      { amountMinor: 1000, currency: 'EUR' },
      { amountMinor: 250, currency: 'EUR' }
    );
    expect(sum.amountMinor).toBe(1250);
    expect(sum.currency).toBe('EUR');

    // Prevents cross-currency addition
    expect(() =>
      addMoney({ amountMinor: 100, currency: 'USD' }, { amountMinor: 100, currency: 'EUR' })
    ).toThrow('Currency mismatch');
  });

  it('validates access package model constraints', () => {
    const pkg = AccessPackageSchema.parse({
      id: '123e4567-e89b-12d3-a456-426614174000',
      ownerId: 'owner_1',
      name: '2-Hour Express Pass',
      durationSeconds: 7200,
      price: { amountMinor: 300, currency: 'USD' },
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(pkg.durationSeconds).toBe(7200);
    expect(pkg.price.amountMinor).toBe(300);
  });
});

describe('Phase 1: Session State Machine & Gateway Reality', () => {
  it('authorizes legal session state transitions', () => {
    expect(isValidSessionTransition('created', 'awaiting_payment')).toBe(true);
    expect(isValidSessionTransition('awaiting_payment', 'payment_verified')).toBe(true);
    expect(isValidSessionTransition('payment_verified', 'activation_pending')).toBe(true);
    expect(isValidSessionTransition('activation_pending', 'active')).toBe(true);
    expect(isValidSessionTransition('active', 'expired')).toBe(true);
  });

  it('rejects illegal session state transitions and leaps', () => {
    // Cannot jump from created directly to active without payment
    expect(isValidSessionTransition('created', 'active')).toBe(false);

    // Terminal states cannot transition to active
    expect(isValidSessionTransition('expired', 'active')).toBe(false);
    expect(isValidSessionTransition('cancelled', 'active')).toBe(false);
  });

  it('honestly exposes gateway capabilities and disclosures', () => {
    const ownerMode = getGatewayCapabilities('limited_owner_mode');
    expect(ownerMode.canDisconnectClient).toBe(false);
    expect(ownerMode.canLimitBandwidth).toBe(false);
    expect(ownerMode.canMeasureTraffic).toBe(false);
    expect(ownerMode.requiresHardwareGateway).toBe(false);
    expect(ownerMode.disclosureStatement).toContain('Standard Android hotspot mode cannot enforce');

    const managedMode = getGatewayCapabilities('managed_gateway_mode');
    expect(managedMode.canDisconnectClient).toBe(true);
    expect(managedMode.canLimitBandwidth).toBe(true);
    expect(managedMode.canMeasureTraffic).toBe(true);
    expect(managedMode.requiresHardwareGateway).toBe(true);
  });

  it('redacts sensitive credentials, tokens, and secrets from payloads', () => {
    const payload = {
      user: 'alice',
      secret: 'super-secret-key',
      auth: {
        token: 'jwt.token.here',
        apiKey: 'ai-api-key',
        nested: {
          password: 'plain-text-pwd',
          safeField: 'visible-info',
        },
      },
    };

    const redacted = redactSensitiveData(payload);
    expect(redacted.secret).toBe('[REDACTED]');
    expect(redacted.auth.token).toBe('[REDACTED]');
    expect(redacted.auth.apiKey).toBe('[REDACTED]');
    expect(redacted.auth.nested.password).toBe('[REDACTED]');
    expect(redacted.auth.nested.safeField).toBe('visible-info');
    expect(redacted.user).toBe('alice');
  });
});
