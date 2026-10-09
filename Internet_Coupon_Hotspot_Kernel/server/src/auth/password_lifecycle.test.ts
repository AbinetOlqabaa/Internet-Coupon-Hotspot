import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

describe('Authentication & Password Lifecycle Suite', () => {
  let userEmail: string;
  let userToken: string;

  beforeEach(async () => {
    userEmail = `pw_user_${Date.now()}_${Math.random().toString(36).substring(7)}@hotspot.test`;
    const regRes = await request(app).post('/api/v1/auth/register').send({
      email: userEmail,
      password: 'initialPassword123!',
      businessName: 'Lifecycle Hotspot',
    });
    userToken = regRes.body.token;
  });

  it('allows authenticated user to change password and invalidates old session', async () => {
    // 1. Change password
    const changeRes = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        currentPassword: 'initialPassword123!',
        newPassword: 'brandNewPassword456!',
      });
    expect(changeRes.status).toBe(200);

    // 2. Old token is now invalidated
    const oldTokenRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${userToken}`);
    expect(oldTokenRes.status).toBe(401);

    // 3. Old password can no longer log in
    const oldLoginRes = await request(app).post('/api/v1/auth/login').send({
      email: userEmail,
      password: 'initialPassword123!',
    });
    expect(oldLoginRes.status).toBe(401);

    // 4. New password logs in successfully
    const newLoginRes = await request(app).post('/api/v1/auth/login').send({
      email: userEmail,
      password: 'brandNewPassword456!',
    });
    expect(newLoginRes.status).toBe(200);
    expect(newLoginRes.body.token).toBeDefined();
  });

  it('rejects password change if current password is wrong or new password is too short', async () => {
    // Wrong current password
    const wrongCurrentRes = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        currentPassword: 'wrongCurrentPassword',
        newPassword: 'validPassword789!',
      });
    expect(wrongCurrentRes.status).toBe(400);

    // Too short new password (< 8 chars)
    const shortNewRes = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        currentPassword: 'initialPassword123!',
        newPassword: 'short',
      });
    expect(shortNewRes.status).toBe(400);
  });

  it('executes secure forgot-password and reset-password workflow without token leakage', async () => {
    // 1. Forgot password returns generic message
    const forgotRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: userEmail });

    expect(forgotRes.status).toBe(200);
    expect(forgotRes.body.message).toContain('password reset instructions have been sent');

    // In dev mode, test token is provided for verification
    const devToken = forgotRes.body.devResetToken;
    expect(devToken).toBeDefined();

    // 2. Reset password with valid token
    const resetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({
        token: devToken,
        newPassword: 'resetCompletePassword789!',
      });
    expect(resetRes.status).toBe(200);

    // 3. Token cannot be reused (single-use token)
    const reuseRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({
        token: devToken,
        newPassword: 'anotherPassword123!',
      });
    expect(reuseRes.status).toBe(400);
    expect(reuseRes.body.error.code).toBe('RESET_FAILED');

    // 4. User can log in with reset password
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: userEmail,
      password: 'resetCompletePassword789!',
    });
    expect(loginRes.status).toBe(200);
  });

  it('enforces rate limiting and anti-automation lockout after repeated failed logins', async () => {
    const targetEmail = `brute_${Date.now()}@hotspot.test`;
    await request(app).post('/api/v1/auth/register').send({
      email: targetEmail,
      password: 'targetPassword123!',
      businessName: 'Lockout Test',
    });

    // 5 consecutive failed login attempts
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: targetEmail,
        password: 'incorrectPassword',
      });
      expect(res.status).toBe(401);
    }

    // 6th attempt triggers temporary lockout
    const lockedRes = await request(app).post('/api/v1/auth/login').send({
      email: targetEmail,
      password: 'targetPassword123!', // Even with correct password, lockout applies
    });
    expect(lockedRes.status).toBe(401);
    expect(lockedRes.body.error.message).toContain('Too many failed attempts');
  });
});
