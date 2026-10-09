import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { defaultDb } from '../db/repositories.js';

describe('Administrator & RBAC Management Suite', () => {
  let superAdminToken: string;
  let superAdminId: string;
  let ownerToken: string;
  let ownerId: string;

  beforeEach(async () => {
    // 1. Bootstrap or elevate SUPER_ADMIN
    const adminEmail = `admin_${Date.now()}_${Math.random().toString(36).substring(7)}@hotspot.local`;
    const bootRes = await request(app).post('/api/v1/admin/bootstrap').send({
      email: adminEmail,
      password: 'superAdminSecurePassword123!',
      displayName: 'Lead Administrator',
    });

    if (bootRes.status === 201) {
      superAdminToken = bootRes.body.token;
      superAdminId = bootRes.body.user.id;
    } else {
      // If admin bootstrap is already closed, register and elevate to SUPER_ADMIN via repository
      const regAdmin = await request(app).post('/api/v1/auth/register').send({
        email: adminEmail,
        password: 'superAdminSecurePassword123!',
        businessName: 'System Core',
      });
      superAdminId = regAdmin.body.owner.id;
      await defaultDb.owners.update(superAdminId, { role: 'SUPER_ADMIN' });

      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: adminEmail,
        password: 'superAdminSecurePassword123!',
      });
      superAdminToken = loginRes.body.token;
    }

    // 2. Register normal OWNER
    const ownerEmail = `owner_${Date.now()}_${Math.random().toString(36).substring(7)}@hotspot.local`;
    const regOwner = await request(app).post('/api/v1/auth/register').send({
      email: ownerEmail,
      password: 'ownerSecurePassword123!',
      businessName: 'Coastal Cafe',
    });
    ownerToken = regOwner.body.token;
    ownerId = regOwner.body.owner.id;
  });

  it('rejects unauthenticated bootstrap when administrator is already initialized', async () => {
    const secondBoot = await request(app).post('/api/v1/admin/bootstrap').send({
      email: 'attacker@evil.com',
      password: 'attackerPassword123!',
    });
    expect(secondBoot.status).toBe(400);
    expect(secondBoot.body.error.message).toContain('Administrator bootstrap is closed');
  });

  it('provides real system metrics in admin overview', async () => {
    const res = await request(app)
      .get('/api/v1/admin/overview')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.metrics.totalUsers).toBeGreaterThanOrEqual(1);
    expect(res.body.metrics.activeUsers).toBeGreaterThanOrEqual(1);
    expect(res.body.system.rateLimiterActive).toBe(true);
  });

  it('manages user accounts with search, role filters, and pagination', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/users?limit=10&offset=0')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.users)).toBe(true);
    expect(listRes.body.pagination.totalCount).toBeGreaterThanOrEqual(1);
    // Verifies passwords are never returned
    expect(listRes.body.users[0].passwordHash).toBeUndefined();
  });

  it('allows creating staff user and prevents unauthorized promotion to SUPER_ADMIN', async () => {
    // 1. Owner creates STAFF user
    const createStaffRes = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: `staff_${Date.now()}@hotspot.local`,
        password: 'staffPassword123!',
        displayName: 'Counter Attendant',
        role: 'STAFF',
      });

    expect(createStaffRes.status).toBe(201);
    expect(createStaffRes.body.user.role).toBe('STAFF');
    expect(createStaffRes.body.user.displayName).toBe('Counter Attendant');

    // 2. Non-superadmin cannot create SUPER_ADMIN account
    const trySuperAdminRes = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: `fakeadmin_${Date.now()}@hotspot.local`,
        password: 'adminPassword123!',
        displayName: 'Rogue Admin',
        role: 'SUPER_ADMIN',
      });

    expect(trySuperAdminRes.status).toBe(403);
    expect(trySuperAdminRes.body.error.code).toBe('FORBIDDEN');
  });

  it('deactivates user, revokes active sessions, and protects the last SUPER_ADMIN', async () => {
    // 1. Create a regular user
    const regUser = await request(app).post('/api/v1/auth/register').send({
      email: `victim_${Date.now()}@hotspot.test`,
      password: 'victimPassword123!',
      businessName: 'Victim Spot',
    });
    const victimToken = regUser.body.token;
    const victimId = regUser.body.owner.id;

    // 2. Deactivate user account
    const deactRes = await request(app)
      .post(`/api/v1/admin/users/${victimId}/deactivate`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(deactRes.status).toBe(200);
    expect(deactRes.body.user.isActive).toBe(false);

    // 3. Deactivated user token is now rejected on protected routes (revoked session)
    const blockedRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${victimToken}`);
    expect([401, 403]).toContain(blockedRes.status);

    // 4. Deactivated user cannot log in
    const loginAttempt = await request(app).post('/api/v1/auth/login').send({
      email: `victim_${Date.now()}@hotspot.test`,
      password: 'victimPassword123!',
    });
    expect(loginAttempt.status).toBe(401);

    // 5. System protects against deactivating the last active SUPER_ADMIN
    // Ensure superAdminId is the sole active SUPER_ADMIN for this assertion
    const allUsers = (await defaultDb.owners.listAll(500)).users;
    for (const u of allUsers) {
      if (u.id !== superAdminId && u.role === 'SUPER_ADMIN') {
        await defaultDb.owners.update(u.id, { role: 'OWNER' });
      }
    }

    const selfDeactRes = await request(app)
      .post(`/api/v1/admin/users/${superAdminId}/deactivate`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(selfDeactRes.status).toBe(400);
    expect(selfDeactRes.body.error.message).toContain('last active SUPER_ADMIN');
  });

  it('queries audit logs and AI operational telemetry insights', async () => {
    // Query audit logs
    const auditRes = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(auditRes.status).toBe(200);
    expect(Array.isArray(auditRes.body.auditLogs)).toBe(true);

    // Query AI insights
    const aiRes = await request(app)
      .get('/api/v1/admin/ai/insights')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(aiRes.status).toBe(200);
    expect(aiRes.body.summary).toBeDefined();
    expect(aiRes.body.insights).toHaveLength(2);
    expect(aiRes.body.disclaimer).toContain('AI operational telemetry');
  });
});
