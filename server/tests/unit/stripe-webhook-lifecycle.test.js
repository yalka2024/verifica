'use strict';

const express = require('express');
const request = require('supertest');

let mockConfigured = true;
let mockEvent;
const mockPrisma = {
  stripeEvent: { create: jest.fn(), delete: jest.fn() },
  subscription: { upsert: jest.fn() },
  invoice: { upsert: jest.fn() },
};
const mockDunning = {
  markPastDue: jest.fn(), activate: jest.fn(), cancel: jest.fn(),
};
jest.mock('../../lib/prisma', () => mockPrisma);
jest.mock('../../lib/billing/dunning', () => mockDunning);
jest.mock('../../lib/billing/stripe', () => ({
  isConfigured: () => mockConfigured,
  verifyWebhook: jest.fn(() => mockEvent),
}));

const stripe = require('../../lib/billing/stripe');
const webhook = require('../../routes/stripe-webhook');

function app() {
  const instance = express();
  instance.use('/api/webhooks', webhook);
  return instance;
}

function post() {
  return request(app()).post('/api/webhooks/stripe')
    .set('content-type', 'application/json').set('stripe-signature', 'test-signature')
    .send(JSON.stringify({ fixture: true }));
}

function subscriptionEvent(id, status = 'active') {
  return { id, type: 'customer.subscription.updated', data: { object: {
    id: `sub-${id}`, customer: 'cus-test', status,
    metadata: { orgId: 'org-1', tierId: 'pro' },
    items: { data: [] }, current_period_start: 1_700_000_000,
    current_period_end: 1_702_592_000, trial_end: null, cancel_at: null,
  } } };
}

describe('Stripe webhook state transitions, retry, and idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks(); mockConfigured = true;
    mockPrisma.stripeEvent.create.mockResolvedValue({});
    mockPrisma.stripeEvent.delete.mockResolvedValue({});
    mockPrisma.subscription.upsert.mockResolvedValue({});
    mockPrisma.invoice.upsert.mockResolvedValue({});
    mockDunning.markPastDue.mockResolvedValue({});
    mockDunning.activate.mockResolvedValue({});
    mockDunning.cancel.mockResolvedValue({});
  });

  test('fails closed when billing is unconfigured or the signature is invalid', async () => {
    mockConfigured = false;
    expect((await post()).status).toBe(503);
    mockConfigured = true;
    stripe.verifyWebhook.mockImplementationOnce(() => { throw new Error('bad signature'); });
    expect((await post()).status).toBe(400);
    expect(mockPrisma.stripeEvent.create).not.toHaveBeenCalled();
  });

  test.each([
    ['trialing', 'trialing'], ['active', 'active'], ['past_due', 'past_due'],
    ['unpaid', 'grace'], ['canceled', 'canceled'], ['incomplete_expired', 'canceled'],
  ])('maps subscription status %s to %s', async (stripeStatus, expected) => {
    mockEvent = subscriptionEvent(`evt-${stripeStatus}`, stripeStatus);
    expect((await post()).status).toBe(200);
    expect(mockPrisma.subscription.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ orgId: 'org-1', status: expected, planId: 'pro' }),
      update: expect.objectContaining({ status: expected, planId: 'pro' }),
    }));
  });

  test('acknowledges duplicate delivery without applying it twice', async () => {
    mockEvent = subscriptionEvent('evt-duplicate');
    mockPrisma.stripeEvent.create.mockRejectedValueOnce(new Error('unique violation'));
    const response = await post();
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ received: true, duplicate: true });
    expect(mockPrisma.subscription.upsert).not.toHaveBeenCalled();
  });

  test('releases the idempotency claim on failure so Stripe can retry', async () => {
    mockEvent = subscriptionEvent('evt-retry');
    mockPrisma.subscription.upsert.mockRejectedValueOnce(new Error('database unavailable'));
    expect((await post()).status).toBe(500);
    expect(mockPrisma.stripeEvent.delete).toHaveBeenCalledWith({ where: { id: 'evt-retry' } });
    expect((await post()).status).toBe(200);
    expect(mockPrisma.subscription.upsert).toHaveBeenCalledTimes(2);
  });

  test('applies payment failure, recovery, invoice persistence, and cancellation', async () => {
    mockEvent = { id: 'evt-failed', type: 'invoice.payment_failed', data: { object: {
      subscription_details: { metadata: { orgId: 'org-1' } }, lines: { data: [] },
    } } };
    expect((await post()).status).toBe(200);
    expect(mockDunning.markPastDue).toHaveBeenCalledWith({ orgId: 'org-1' });

    mockEvent = { id: 'evt-paid', type: 'invoice.payment_succeeded', data: { object: {
      id: 'in-1', subscription: 'sub-1', amount_paid: 2500, currency: 'usd',
      period_start: 1_700_000_000, period_end: 1_702_592_000, hosted_invoice_url: 'https://example.test/invoice',
      subscription_details: { metadata: { orgId: 'org-1' } },
      lines: { data: [{ price: { lookup_key: 'pro' }, metadata: {} }] },
    } } };
    expect((await post()).status).toBe(200);
    expect(mockDunning.activate).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org-1', planId: 'pro' }));
    expect(mockPrisma.invoice.upsert).toHaveBeenCalled();

    mockEvent = { id: 'evt-cancel', type: 'customer.subscription.deleted', data: { object: {
      metadata: { orgId: 'org-1' },
    } } };
    expect((await post()).status).toBe(200);
    expect(mockDunning.cancel).toHaveBeenCalledWith({ orgId: 'org-1', atPeriodEnd: false });
  });
});

