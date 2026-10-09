import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

describe('Phase 5: Customers, Consent, Device/Session History, Search & Pagination', () => {
  let token: string;
  let otherToken: string;

  beforeEach(async () => {
    // Register owner
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `custowner_${Date.now()}_${Math.random().toString(36).substring(7)}@hotspot.test`,
        password: 'password12345!',
        businessName: 'Coffee & Code Hotspot',
      });
    token = regRes.body.token;

    // Register second owner to test isolation
    const otherRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `otherowner_${Date.now()}_${Math.random().toString(36).substring(7)}@hotspot.test`,
        password: 'password12345!',
        businessName: 'Other Hotspot',
      });
    otherToken = otherRes.body.token;
  });

  it('creates customer with consent, phone, and valid MAC address', async () => {
    const res = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        phone: '+15551234567',
        displayName: 'John Doe',
        deviceMac: 'AA:BB:CC:11:22:33',
        consentAccepted: true,
        dataRetentionConsent: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.customer.id).toBeDefined();
    expect(res.body.customer.phone).toBe('+15551234567');
    expect(res.body.customer.deviceMac).toBe('AA:BB:CC:11:22:33');
    expect(res.body.customer.consentAcceptedAt).toBeDefined();
  });

  it('searches and paginates customers by name, phone, or MAC', async () => {
    // Create 3 customers
    await request(app).post('/api/v1/customers').set('Authorization', `Bearer ${token}`).send({
      phone: '+1234567001',
      displayName: 'Alice Smith',
      deviceMac: '11:22:33:44:55:01',
    });
    await request(app).post('/api/v1/customers').set('Authorization', `Bearer ${token}`).send({
      phone: '+1234567002',
      displayName: 'Bob Jones',
      deviceMac: '11:22:33:44:55:02',
    });
    await request(app).post('/api/v1/customers').set('Authorization', `Bearer ${token}`).send({
      phone: '+1234567003',
      displayName: 'Alice Cooper',
      deviceMac: '11:22:33:44:55:03',
    });

    // Query 'Alice'
    const searchRes = await request(app)
      .get('/api/v1/customers?query=Alice')
      .set('Authorization', `Bearer ${token}`);
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.customers).toHaveLength(2);
    expect(searchRes.body.pagination.totalCount).toBe(2);

    // Paginate with limit 1
    const pagedRes = await request(app)
      .get('/api/v1/customers?limit=1&offset=0')
      .set('Authorization', `Bearer ${token}`);
    expect(pagedRes.status).toBe(200);
    expect(pagedRes.body.customers).toHaveLength(1);
    expect(pagedRes.body.pagination.hasMore).toBe(true);
  });

  it('fetches customer details and preserves cross-tenant owner isolation', async () => {
    const createRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        displayName: 'Private Customer',
        phone: '+999999999',
      });
    const customerId = createRes.body.customer.id;

    // Owner 1 can view
    const ownRes = await request(app)
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(ownRes.status).toBe(200);
    expect(ownRes.body.customer.displayName).toBe('Private Customer');

    // Owner 2 cannot view Owner 1's customer
    const otherRes = await request(app)
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(otherRes.status).toBe(404);
  });

  it('updates customer details and supports privacy-compliant deletion', async () => {
    const createRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        displayName: 'Old Name',
      });
    const customerId = createRes.body.customer.id;

    // Update
    const updateRes = await request(app)
      .put(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        displayName: 'New Name',
        phone: '+10000000',
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.customer.displayName).toBe('New Name');
    expect(updateRes.body.customer.phone).toBe('+10000000');

    // Delete
    const deleteRes = await request(app)
      .delete(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);

    // After deletion, 404
    const getRes = await request(app)
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(404);
  });
});
