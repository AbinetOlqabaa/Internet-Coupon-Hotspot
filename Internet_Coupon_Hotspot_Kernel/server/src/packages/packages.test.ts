import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

describe('Phase 6: Access Packages, Pricing Models & Snapshots', () => {
  let token: string;
  let otherToken: string;

  beforeEach(async () => {
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `pkgowner_${Date.now()}_${Math.random().toString(36).substring(7)}@hotspot.test`,
        password: 'password12345!',
        businessName: 'Express Cyber Café',
      });
    token = regRes.body.token;

    const otherRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `pkgother_${Date.now()}_${Math.random().toString(36).substring(7)}@hotspot.test`,
        password: 'password12345!',
        businessName: 'Other Café',
      });
    otherToken = otherRes.body.token;
  });

  it('creates and lists packages with non-negative minor units', async () => {
    const res = await request(app)
      .post('/api/v1/packages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '1-Hour High Speed',
        durationSeconds: 3600,
        priceMinor: 250, // $2.50
        currency: 'USD',
        speedLimitDownKbps: 15000,
        speedLimitUpKbps: 5000,
        active: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.package.name).toBe('1-Hour High Speed');
    expect(res.body.package.durationSeconds).toBe(3600);
    expect(res.body.package.priceMinor).toBe(250);

    // List packages
    const listRes = await request(app)
      .get('/api/v1/packages')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.packages).toHaveLength(1);
    expect(listRes.body.packages[0].name).toBe('1-Hour High Speed');
  });

  it('rejects invalid duration or floating point price', async () => {
    // Non-integer price
    const badPriceRes = await request(app)
      .post('/api/v1/packages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Bad Float Pass',
        durationSeconds: 3600,
        priceMinor: 2.5,
        currency: 'USD',
      });
    expect(badPriceRes.status).toBe(400);

    // Zero/negative duration
    const badDurationRes = await request(app)
      .post('/api/v1/packages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Negative Duration Pass',
        durationSeconds: -60,
        priceMinor: 100,
        currency: 'USD',
      });
    expect(badDurationRes.status).toBe(400);
  });

  it('updates package details while isolating across tenants', async () => {
    const createRes = await request(app)
      .post('/api/v1/packages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Promo 15 Min',
        durationSeconds: 900,
        priceMinor: 100,
        currency: 'USD',
      });
    const packageId = createRes.body.package.id;

    // Owner 1 updates
    const updateRes = await request(app)
      .put(`/api/v1/packages/${packageId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        priceMinor: 150,
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.package.priceMinor).toBe(150);

    // Owner 2 cannot update Owner 1's package
    const otherUpdate = await request(app)
      .put(`/api/v1/packages/${packageId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        priceMinor: 50,
      });
    expect(otherUpdate.status).toBe(404);
  });
});
