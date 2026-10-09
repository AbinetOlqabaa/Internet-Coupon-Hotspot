import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { MemoryDatabase } from '../db/repositories.js';
import { AuthService } from './service.js';

describe('Phase 3: Authentication, Owner Isolation, Permissions & Audit', () => {
  let db: MemoryDatabase;
  let authService: AuthService;

  beforeEach(() => {
    db = new MemoryDatabase();
    authService = new AuthService(db);
  });

  it('registers a new owner with hashed password and session token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `newowner_${Date.now()}@hotspot.local`,
        password: 'securePassword123!',
        businessName: 'Coastal Breeze Hotspot',
        currency: 'USD',
      });

    expect(res.status).toBe(201);
    expect(res.body.owner.id).toBeDefined();
    expect(res.body.owner.email).toContain('@hotspot.local');
    expect(res.body.owner.businessName).toBe('Coastal Breeze Hotspot');
    expect(res.body.owner.passwordHash).toBeUndefined(); // Never leaks hash
    expect(res.body.token).toBeDefined();
  });

  it('rejects registration with short password or duplicate email', async () => {
    const email = `dup_${Date.now()}@hotspot.local`;
    await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'validPassword123!',
      businessName: 'First Cafe',
    });

    // Duplicate email
    const dupRes = await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'validPassword123!',
      businessName: 'Second Cafe',
    });
    expect(dupRes.status).toBe(400);
    expect(dupRes.body.error.code).toBe('REGISTRATION_FAILED');

    // Short password (< 8 chars)
    const shortRes = await request(app).post('/api/v1/auth/register').send({
      email: `short_${Date.now()}@hotspot.local`,
      password: 'short',
      businessName: 'Short Pwd Cafe',
    });
    expect(shortRes.status).toBe(400);
  });

  it('authenticates valid credentials and rejects invalid passwords', async () => {
    const email = `login_${Date.now()}@hotspot.local`;
    await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'correctPassword123!',
      businessName: 'Login Test Cafe',
    });

    // Wrong password
    const badLogin = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'wrongPassword!',
    });
    expect(badLogin.status).toBe(401);
    expect(badLogin.body.error.code).toBe('UNAUTHORIZED');

    // Correct password
    const goodLogin = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'correctPassword123!',
    });
    expect(goodLogin.status).toBe(200);
    expect(goodLogin.body.token).toBeDefined();
    expect(goodLogin.body.owner.email).toBe(email);
  });

  it('protects /me route, verifies bearer tokens, and invalidates on logout', async () => {
    const email = `session_${Date.now()}@hotspot.local`;
    const regRes = await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'password12345!',
      businessName: 'Session Test Cafe',
    });

    const token = regRes.body.token;

    // Unauthorized without token
    const unauth = await request(app).get('/api/v1/auth/me');
    expect(unauth.status).toBe(401);

    // Authorized with token
    const authProfile = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(authProfile.status).toBe(200);
    expect(authProfile.body.owner.email).toBe(email);

    // Logout
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logoutRes.status).toBe(200);

    // Token should now be invalid
    const revokedProfile = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(revokedProfile.status).toBe(401);
  });

  it('guarantees tenant isolation and records audit trail', async () => {
    const reg1 = await authService.register({
      email: 'owner1@test.com',
      password: 'password123!',
      businessName: 'Owner 1 Spot',
    });

    const reg2 = await authService.register({
      email: 'owner2@test.com',
      password: 'password123!',
      businessName: 'Owner 2 Spot',
    });

    // Create a package for Owner 1
    const pkg1 = await db.packages.create({
      ownerId: reg1.owner.id,
      name: 'Owner 1 Exclusive',
      durationSeconds: 3600,
      priceMinor: 200,
      currency: 'USD',
      active: true,
    });

    // Owner 2 cannot query Owner 1's package via repository boundary
    const pkgForOwner2 = await db.packages.findById(reg2.owner.id, pkg1.id);
    expect(pkgForOwner2).toBeNull();

    // Verify audit logs were written for registration actions
    const auditLogs1 = await db.audit.list(reg1.owner.id);
    expect(auditLogs1.length).toBeGreaterThanOrEqual(1);
    expect(auditLogs1[0].action).toBe('owner.registered');
    expect(auditLogs1[0].ownerId).toBe(reg1.owner.id);
  });
});
