/**
 * Outcome-based billing for Verifica.
 *
 * Bills per successful business outcome (e.g. "invoice_processed") instead of
 * per seat. recordOutcome() only meters outcomes confirmed successful — the
 * verification hook — so failed work is never billed. Successful, billable
 * outcomes are reported to Stripe as metered usage when configured.
 *
 * DURABLE: every recorded outcome is a Prisma OutcomeEvent row (billable
 * history survives restarts and deploys); `outcomeId` gives caller-side
 * idempotency (a retried record with the same id is a no-op). If the database
 * is briefly unavailable the event falls back to an in-memory counter and the
 * response says so (degraded: true) — visible, never silent.
 */
const fs = require('fs');
const path = require('path');
const prisma = require('./prisma');

function loadConfig() {
  try {
    const p = path.join(__dirname, '..', 'config', 'outcomes.json');
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return { model: raw.billing_model || 'per_seat', events: Array.isArray(raw.events) ? raw.events : [] };
  } catch { return { model: 'per_seat', events: [] }; }
}
const CONFIG = loadConfig();
const BILLABLE = new Set(CONFIG.events);

// Degraded-mode fallback only (DB outage): namespace -> Map(event -> counts).
const _fallback = new Map();
function _bumpFallback(orgId, event, field, qty) {
  const k = orgId || 'default';
  if (!_fallback.has(k)) _fallback.set(k, new Map());
  const ns = _fallback.get(k);
  const cur = ns.get(event) || { billed: 0, unverified: 0 };
  cur[field] += qty;
  ns.set(event, cur);
}

function isBillable(event) { return BILLABLE.has(event); }

async function persistOutcome(ctx, event, { quantity, billed, metadata }) {
  // The OutcomeEvent model is generated only for outcome-billing platforms;
  // fall back to in-memory counters if it is absent or the DB is down.
  if (!prisma || !prisma.outcomeEvent) {
    _bumpFallback(ctx.orgId, event, billed ? 'billed' : 'unverified', quantity);
    return { durable: false, duplicate: false };
  }
  try {
    await prisma.outcomeEvent.create({
      data: {
        orgId: ctx.orgId || null,
        userId: ctx.userId || null,
        event,
        quantity,
        billed,
        outcomeId: ctx.outcomeId || null,
        metadata: metadata && Object.keys(metadata).length ? JSON.stringify(metadata).slice(0, 4000) : null,
      },
    });
    return { durable: true, duplicate: false };
  } catch (e) {
    // Unique violation on (orgId, event, outcomeId): the same outcome was
    // already recorded — idempotent no-op, and NOT double-billed to Stripe.
    if (e && e.code === 'P2002') return { durable: true, duplicate: true };
    _bumpFallback(ctx.orgId, event, billed ? 'billed' : 'unverified', quantity);
    return { durable: false, duplicate: false, error: e.message };
  }
}

/** Report metered usage to Stripe (best-effort; no-op unless configured). */
async function reportToStripe(event, quantity, ctx) {
  if (!process.env.STRIPE_SECRET_KEY) return { reported: false, reason: 'stripe_unconfigured' };
  const itemEnv = `STRIPE_OUTCOME_ITEM_${event.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
  const subscriptionItem = process.env[itemEnv];
  if (!subscriptionItem) return { reported: false, reason: 'no_subscription_item' };
  try {
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    await stripe.subscriptionItems.createUsageRecord(subscriptionItem, {
      quantity, timestamp: Math.floor(Date.now() / 1000), action: 'increment',
    }, { idempotencyKey: `${ctx.orgId}:${event}:${ctx.outcomeId || Date.now()}` });
    return { reported: true, subscriptionItem };
  } catch (e) {
    return { reported: false, reason: e.message };
  }
}

/**
 * Record a business outcome.
 * @param {object} ctx { orgId, userId, outcomeId? }
 * @param {string} event  outcome event name (must be a configured billable event)
 * @param {object} opts { quantity=1, success=true, metadata }
 * @returns {Promise<{ billed, metered, stripe, durable, duplicate }>}
 */
async function recordOutcome(ctx, event, { quantity = 1, success = true, metadata = {} } = {}) {
  if (!isBillable(event)) {
    return { billed: false, reason: 'event_not_billable', event };
  }
  // Verification hook: only confirmed-successful outcomes are billed.
  if (!success) {
    const p = await persistOutcome(ctx, event, { quantity, billed: false, metadata });
    return { billed: false, reason: 'outcome_not_successful', event, durable: p.durable };
  }
  const p = await persistOutcome(ctx, event, { quantity, billed: true, metadata });
  if (p.duplicate) {
    return { billed: false, reason: 'duplicate_outcome', event, durable: true, duplicate: true };
  }
  const stripe = await reportToStripe(event, quantity, ctx);
  return { billed: true, event, quantity, metered: CONFIG.model === 'outcome', stripe, durable: p.durable, degraded: !p.durable || undefined };
}

/** Aggregate billed/unverified per event from the durable ledger (+ any
 *  degraded-mode fallback counts, reported separately). */
async function summary(orgId) {
  const events = {};
  try {
    if (!prisma || !prisma.outcomeEvent) throw new Error('outcome ledger not generated');
    const rows = await prisma.outcomeEvent.groupBy({
      by: ['event', 'billed'],
      where: { orgId: orgId || null },
      _sum: { quantity: true },
    });
    for (const r of rows) {
      const cur = events[r.event] || { billed: 0, unverified: 0 };
      cur[r.billed ? 'billed' : 'unverified'] += r._sum.quantity || 0;
      events[r.event] = cur;
    }
  } catch {
    /* DB unavailable — fall through to the in-memory view below */
  }
  const ns = _fallback.get(orgId || 'default');
  const fallback = {};
  if (ns) for (const [event, v] of ns.entries()) fallback[event] = v;
  return { billing_model: CONFIG.model, billable_events: CONFIG.events, events, ...(Object.keys(fallback).length ? { degraded_unpersisted: fallback } : {}) };
}

module.exports = { recordOutcome, isBillable, summary, billableEvents: () => CONFIG.events, model: CONFIG.model };

