'use strict';

jest.mock('../../lib/prisma', () => ({
  subscription: { findFirst: jest.fn() },
  usageCounter: { findUnique: jest.fn() },
}));

const prisma = require('../../lib/prisma');
const entitlements = require('../../lib/entitlements');

describe('entitlements fail closed', () => {
  beforeEach(() => jest.clearAllMocks());

  test('unknown tier falls back to the free tier and unknown features are denied', async () => {
    prisma.subscription.findFirst.mockResolvedValue({ planId: '__unknown__', status: 'active' });
    expect(await entitlements.can('org-1', '__unknown_feature__')).toBe(false);
    expect(await entitlements.getLimit('org-1', '__unknown_meter__')).toBe(0);
  });

  test('no subscription receives the free tier', async () => {
    prisma.subscription.findFirst.mockResolvedValue(null);
    const sub = await entitlements.getActiveSubscription('org-1');
    expect(sub.status).toBe('none');
    expect(sub.tier.id).toBe(entitlements.FREE_TIER_ID);
  });

  test('usage at the limit is rejected without negative remaining', async () => {
    prisma.subscription.findFirst.mockResolvedValue(null);
    const meter = Object.keys(entitlements.getTier(entitlements.FREE_TIER_ID).limits || {})[0];
    if (!meter) return;
    const limit = await entitlements.getLimit('org-1', meter);
    if (limit < 0) return;
    prisma.usageCounter.findUnique.mockResolvedValue({ value: limit });
    await expect(entitlements.checkUsage('org-1', meter, 1)).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
    });
  });
});

