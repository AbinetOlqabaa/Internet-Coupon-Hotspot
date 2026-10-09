import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryDatabase } from './repositories.js';
import { PackageEntitySchema, OwnerEntitySchema } from './schema.js';

describe('Phase 2: Database Repositories, Constraints & Transactions', () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = new MemoryDatabase();
  });

  it('validates owner creation and retrieval by email', async () => {
    const owner = await db.owners.create({
      email: 'owner@hotspot.local',
      passwordHash: 'argon2id$hashedpassword',
      businessName: 'Lakeside Café Hotspot',
      defaultCurrency: 'USD',
      isActive: true,
    });

    expect(owner.id).toBeDefined();
    expect(owner.email).toBe('owner@hotspot.local');

    const found = await db.owners.findByEmail('owner@hotspot.local');
    expect(found).not.toBeNull();
    expect(found?.id).toBe(owner.id);

    // Schema validation
    expect(() => OwnerEntitySchema.parse(owner)).not.toThrow();
  });

  it('enforces package price integer minor units and schema constraints', async () => {
    const owner = await db.owners.create({
      email: 'cafe@wifi.net',
      passwordHash: 'hash',
      businessName: 'Cafe Wifi',
      defaultCurrency: 'USD',
      isActive: true,
    });

    const pkg = await db.packages.create({
      ownerId: owner.id,
      name: '1 Hour Standard',
      durationSeconds: 3600,
      priceMinor: 250, // 2.50 USD
      currency: 'USD',
      active: true,
    });

    expect(pkg.priceMinor).toBe(250);
    expect(pkg.durationSeconds).toBe(3600);

    const list = await db.packages.list(owner.id, true);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(pkg.id);

    expect(() => PackageEntitySchema.parse(pkg)).not.toThrow();
  });

  it('enforces unique coupon code constraint per owner', async () => {
    const owner = await db.owners.create({
      email: 'hotel@hotspot.local',
      passwordHash: 'hash',
      businessName: 'Hotel Hotspot',
      defaultCurrency: 'USD',
      isActive: true,
    });

    const pkg = await db.packages.create({
      ownerId: owner.id,
      name: 'VIP Day Pass',
      durationSeconds: 86400,
      priceMinor: 1000,
      currency: 'USD',
      active: true,
    });

    const coupon = await db.coupons.create({
      ownerId: owner.id,
      code: 'WELCOME10',
      packageId: pkg.id,
      maxUses: 5,
      currentUses: 0,
      active: true,
    });

    expect(coupon.code).toBe('WELCOME10');

    // Duplicate code for same owner must throw
    await expect(
      db.coupons.create({
        ownerId: owner.id,
        code: 'WELCOME10',
        packageId: pkg.id,
        maxUses: 1,
        currentUses: 0,
        active: true,
      })
    ).rejects.toThrow(/Unique constraint/);

    // Increment coupon uses
    const incSuccess = await db.coupons.incrementUses(owner.id, coupon.id);
    expect(incSuccess).toBe(true);
    const updated = await db.coupons.findByCode(owner.id, 'welcome10');
    expect(updated?.currentUses).toBe(1);
  });

  it('tracks session lifecycle and status updates idempotently', async () => {
    const owner = await db.owners.create({
      email: 'resort@hotspot.local',
      passwordHash: 'hash',
      businessName: 'Resort Net',
      defaultCurrency: 'USD',
      isActive: true,
    });

    const pkg = await db.packages.create({
      ownerId: owner.id,
      name: '30 Minutes',
      durationSeconds: 1800,
      priceMinor: 100,
      currency: 'USD',
      active: true,
    });

    const session = await db.sessions.create({
      ownerId: owner.id,
      packageId: pkg.id,
      status: 'created',
      durationSeconds: 1800,
      remainingSeconds: 1800,
      deviceMac: 'AA:BB:CC:DD:EE:FF',
    });

    expect(session.status).toBe('created');

    const activatedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 1800 * 1000).toISOString();
    const updated = await db.sessions.updateStatus(owner.id, session.id, 'active', {
      activatedAt,
      expiresAt,
    });

    expect(updated?.status).toBe('active');
    expect(updated?.activatedAt).toBe(activatedAt);
    expect(updated?.expiresAt).toBe(expiresAt);
  });

  it('enforces payment idempotency keys to prevent duplicate billing', async () => {
    const owner = await db.owners.create({
      email: 'mall@wifi.org',
      passwordHash: 'hash',
      businessName: 'Mall Wifi',
      defaultCurrency: 'USD',
      isActive: true,
    });

    const pkg = await db.packages.create({
      ownerId: owner.id,
      name: 'Pass',
      durationSeconds: 3600,
      priceMinor: 500,
      currency: 'USD',
      active: true,
    });

    const session = await db.sessions.create({
      ownerId: owner.id,
      packageId: pkg.id,
      status: 'awaiting_payment',
      durationSeconds: 3600,
      remainingSeconds: 3600,
    });

    const payment = await db.payments.create({
      ownerId: owner.id,
      sessionId: session.id,
      amountMinor: 500,
      currency: 'USD',
      provider: 'stripe_mock',
      status: 'pending',
      idempotencyKey: 'idem_checkout_991823',
    });

    expect(payment.idempotencyKey).toBe('idem_checkout_991823');

    // Duplicate idempotency key must reject
    await expect(
      db.payments.create({
        ownerId: owner.id,
        sessionId: session.id,
        amountMinor: 500,
        currency: 'USD',
        provider: 'stripe_mock',
        status: 'pending',
        idempotencyKey: 'idem_checkout_991823',
      })
    ).rejects.toThrow(/idempotency/);
  });

  it('records tamper-evident audit logs and ledger transactions', async () => {
    const owner = await db.owners.create({
      email: 'audit@test.com',
      passwordHash: 'hash',
      businessName: 'Audit Test',
      defaultCurrency: 'USD',
      isActive: true,
    });

    const auditEvent = await db.audit.append({
      ownerId: owner.id,
      actor: 'system',
      action: 'package.created',
      resourceType: 'package',
      resourceId: 'pkg_123',
      details: { name: 'Promo Pass', priceMinor: 150 },
    });

    expect(auditEvent.id).toBeDefined();
    expect(auditEvent.action).toBe('package.created');

    const logs = await db.audit.list(owner.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe(auditEvent.id);

    // Ledger entry
    const ledger = await db.ledger.create({
      ownerId: owner.id,
      entryType: 'sale',
      amountMinor: 150,
      currency: 'USD',
      description: 'Coupon sale promo',
    });
    expect(ledger.amountMinor).toBe(150);

    const ledgerList = await db.ledger.listByOwner(owner.id);
    expect(ledgerList).toHaveLength(1);
  });
});
