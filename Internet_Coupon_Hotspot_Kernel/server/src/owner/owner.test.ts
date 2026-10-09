import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

describe('Phase 4: Owner Profile, Settings, Capability Status & Dashboard', () => {
  it('manages owner profile and returns honest capability dashboard metrics', async () => {
    // 1. Register owner
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `dashboard_${Date.now()}@hotspot.test`,
        password: 'securePassword123!',
        businessName: 'Harbor Marina Hotspot',
        currency: 'USD',
      });
    const token = regRes.body.token;

    // 2. Fetch owner profile
    const profileRes = await request(app)
      .get('/api/v1/owner/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.profile.businessName).toBe('Harbor Marina Hotspot');

    // 3. Update owner profile
    const updateRes = await request(app)
      .put('/api/v1/owner/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        businessName: 'Harbor Marina & Yacht Club Hotspot',
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.profile.businessName).toBe('Harbor Marina & Yacht Club Hotspot');

    // 4. Query owner dashboard
    const dashRes = await request(app)
      .get('/api/v1/owner/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.metrics.totalPackages).toBe(0);
    expect(dashRes.body.metrics.activeSessions).toBe(0);
    expect(dashRes.body.metrics.totalRevenueMinor).toBe(0);
    expect(dashRes.body.status.gatewayMode).toBe('limited_owner_mode');
    expect(dashRes.body.status.enforcementDisclosure).toContain('Limited owner-management mode');
  });

  it('rejects unauthenticated requests to owner routes', async () => {
    const unauth = await request(app).get('/api/v1/owner/dashboard');
    expect(unauth.status).toBe(401);
  });
});
