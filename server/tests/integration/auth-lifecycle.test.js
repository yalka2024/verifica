'use strict';
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const prisma = require('../../lib/prisma');
const authRoutes = require('../../routes/auth');
const { errorMiddleware } = require('../../lib/validate');

jest.mock('../../lib/email', () => ({ sendTemplate: jest.fn(async () => ({ provider: 'test' })) }));
jest.mock('../../lib/audit', () => ({ audit: jest.fn(async () => {}) }));

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use(cookieParser());
  instance.use('/api/auth', authRoutes);
  instance.use(errorMiddleware);
  return instance;
}

const describeWithDatabase = process.env.KUBILD_TEST_DATABASE_AVAILABLE === '1' ? describe : describe.skip;

describeWithDatabase('complete authentication lifecycle', () => {
  const email = `auth-${Date.now()}@example.test`;
  const password = 'Correct-Horse-Battery-Staple-42!';
  let user;
  let refreshCookie;

  afterAll(async () => {
    if (user) {
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await prisma.onboardingState.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await prisma.$disconnect();
  });

  test('registers, creates a session, and returns the authenticated user', async () => {
    const agent = request.agent(app());
    const registered = await agent.post('/api/auth/register').send({ email, password, name: 'Lifecycle Test' });
    expect(registered.status).toBe(201);
    expect(registered.body.user.email).toBe(email);
    user = await prisma.user.findUnique({ where: { email } });
    expect(user.passwordHash).not.toBe(password);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.id);
  });

  test('rejects duplicate registration and invalid credentials', async () => {
    const duplicate = await request(app()).post('/api/auth/register').send({ email, password });
    expect(duplicate.status).toBe(409);
    const invalid = await request(app()).post('/api/auth/login').send({ email, password: 'wrong-password' });
    expect(invalid.status).toBe(401);
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated.failedLogins).toBeGreaterThan(0);
  });

  test('logs in, rotates a refresh token, then logs out', async () => {
    // Registration creates its own valid session. Remove it so this test can
    // assert the complete login -> rotate -> logout lifecycle in isolation.
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    const agent = request.agent(app());
    const login = await agent.post('/api/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    refreshCookie = login.headers['set-cookie'].find((value) => value.startsWith('refresh_token='));
    expect(refreshCookie).toBeTruthy();

    const refresh = await agent.post('/api/auth/refresh');
    expect(refresh.status).toBe(200);
    const active = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
    expect(active).toBe(1);

    const logout = await agent.post('/api/auth/logout');
    expect(logout.status).toBe(200);
    expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  });

  test('verifies email and rejects token reuse', async () => {
    const token = 'verification-token-that-is-long-enough';
    const { hashToken } = require('../../lib/security');
    await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
    await prisma.emailVerificationToken.create({ data: {
      userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000),
    } });
    const first = await request(app()).post('/api/auth/verify-email').send({ token });
    expect(first.status).toBe(200);
    const reuse = await request(app()).post('/api/auth/verify-email').send({ token });
    expect(reuse.status).toBe(400);
  });

  test('resets the password and revokes existing sessions', async () => {
    const token = 'password-reset-token-that-is-long-enough';
    const { hashToken } = require('../../lib/security');
    await prisma.passwordResetToken.create({ data: {
      userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000),
    } });
    const nextPassword = 'Another-Correct-Horse-Battery-99!';
    const reset = await request(app()).post('/api/auth/reset-password').send({ token, password: nextPassword });
    expect(reset.status).toBe(200);
    expect((await request(app()).post('/api/auth/login').send({ email, password })).status).toBe(401);
    expect((await request(app()).post('/api/auth/login').send({ email, password: nextPassword })).status).toBe(200);
  });

  test('covers MFA setup, invalid enable, and password-confirmed disable', async () => {
    const nextPassword = 'Another-Correct-Horse-Battery-99!';
    const agent = request.agent(app());
    expect((await agent.post('/api/auth/login').send({ email, password: nextPassword })).status).toBe(200);
    const setup = await agent.post('/api/auth/mfa/setup');
    expect(setup.status).toBe(200);
    expect(setup.body.otpauth).toMatch(/^otpauth:\/\/totp\//);
    expect((await agent.post('/api/auth/mfa/enable').send({ totp: '000000' })).status).toBe(400);
    expect((await agent.post('/api/auth/mfa/disable').send({ password: 'wrong' })).status).toBe(401);
    expect((await agent.post('/api/auth/mfa/disable').send({ password: nextPassword })).status).toBe(200);
  });
});

