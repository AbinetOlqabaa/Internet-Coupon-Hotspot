import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

describe('Phase 6: Coupons, Vouchers, Redemption Validation & Abuse Controls', () => {
  let token: string;
  let ownerId: string;
  let packageId: string;

  beforeEach(async () => {
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `coupon_${Date.now()}_${Math.random().toString(36).substring(7)}@hotspot.test`,
        password: 'password12345!',
        businessName: 'Voucher Hub Hotspot',
      });
    token = regRes.body.token;
    ownerId = regRes.body.owner.id;

    // Create a package
    const pkgRes = await request(app)
      .post('/api/v1/packages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Standard 2 Hours',
        durationSeconds: 7200,
        priceMinor: 400,
        currency: 'USD',
      });
    packageId = pkgRes.body.package.id;
  });

  it('creates and lists coupons with uppercase normalization and usage limits', async () => {
    const res = await request(app)
      .post('/api/v1/coupons')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'summer2026',
        packageId,
        maxUses: 10,
        active: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.coupon.code).toBe('SUMMER2026'); // Uppercase normalized
    expect(res.body.coupon.maxUses).toBe(10);
    expect(res.body.coupon.currentUses).toBe(0);

    // List coupons
    const listRes = await request(app)
      .get('/api/v1/coupons')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.coupons).toHaveLength(1);
    expect(listRes.body.coupons[0].code).toBe('SUMMER2026');
  });

  it('validates active voucher and returns pricing snapshot to customer', async () => {
    await request(app)
      .post('/api/v1/coupons')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'GUESTPASS',
        packageId,
        maxUses: 1,
      });

    // Public validation endpoint
    const valRes = await request(app)
      .post('/api/v1/coupons/validate')
      .send({
        ownerId,
        code: 'guestpass', // Case-insensitive input
      });

    expect(valRes.status).toBe(200);
    expect(valRes.body.valid).toBe(true);
    expect(valRes.body.coupon.code).toBe('GUESTPASS');
    expect(valRes.body.coupon.remainingUses).toBe(1);
    expect(valRes.body.packageSnapshot.id).toBe(packageId);
    expect(valRes.body.packageSnapshot.name).toBe('Standard 2 Hours');
    expect(valRes.body.packageSnapshot.durationSeconds).toBe(7200);
    expect(valRes.body.packageSnapshot.priceMinor).toBe(400);
  });

  it('rejects expired, exhausted, or non-existent voucher codes', async () => {
    // 1. Non-existent code
    const fakeRes = await request(app)
      .post('/api/v1/coupons/validate')
      .send({
        ownerId,
        code: 'DOESNOTEXIST',
      });
    expect(fakeRes.status).toBe(404);
    expect(fakeRes.body.valid).toBe(false);
    expect(fakeRes.body.error.code).toBe('COUPON_NOT_FOUND');

    // 2. Expired voucher
    const expiredPast = new Date(Date.now() - 3600000).toISOString();
    await request(app)
      .post('/api/v1/coupons')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'OLDEXPIRED',
        packageId,
        maxUses: 5,
        expiresAt: expiredPast,
      });

    const expValRes = await request(app)
      .post('/api/v1/coupons/validate')
      .send({
        ownerId,
        code: 'OLDEXPIRED',
      });
    expect(expValRes.status).toBe(400);
    expect(expValRes.body.error.code).toBe('COUPON_EXPIRED');
  });
});
