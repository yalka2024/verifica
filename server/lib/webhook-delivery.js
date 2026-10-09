/**
 * Outbound webhook delivery worker.
 * - Persists every delivery in WebhookDelivery
 * - Signs each request with HMAC-SHA256 of the body using webhook.secret
 * - Exponential backoff: 30s, 2m, 10m, 1h, 6h (5 attempts)
 * - After max attempts -> status=dead (Dead-Letter), webhook auto-disabled after N consecutive deliveries fail
 *
 * Tick loop runs every 15s (single-process). For multi-instance, run with
 * a single dedicated worker process.
 */
const crypto = require('crypto');
const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const net = require('net');
const prisma = require('./prisma');
const metrics = require('./metrics');

// ── SSRF guard ──────────────────────────────────────────────────────────────
// Webhook URLs are user-supplied: without this, any authenticated user could
// point a hook at 169.254.169.254 (cloud metadata), localhost, or RFC1918
// space and use the server as a pivot. Every delivery re-checks (hooks can be
// edited) and redirects are never followed (see fetch redirect:'manual').
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0 && (c === 0 || c === 2))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113)
      || (a === 169 && b === 254)      // link-local incl. cloud metadata
      || (a === 100 && b >= 64 && b <= 127)
      || a >= 224; // multicast, reserved, and broadcast
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) {
    const mapped = v6.slice(7);
    if (net.isIPv4(mapped)) return isPrivateIp(mapped);
    const words = mapped.split(':');
    if (words.length === 2) {
      const hi = Number.parseInt(words[0], 16);
      const lo = Number.parseInt(words[1], 16);
      if (Number.isInteger(hi) && Number.isInteger(lo)) {
        return isPrivateIp(`${hi >>> 8}.${hi & 255}.${lo >>> 8}.${lo & 255}`);
      }
    }
    return true;
  }
  return v6 === '::1' || v6 === '::'
    || v6.startsWith('fc') || v6.startsWith('fd')   // ULA fc00::/7
    || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb') // link-local fe80::/10
    || v6.startsWith('ff') || v6.startsWith('2001:db8:');
}
async function assertPublicUrl(rawUrl) {
  const u = new URL(rawUrl);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('webhook url must be http(s)');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new Error('webhook url resolves to a private address');
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('webhook url resolves to a private address');
    return { url: u, address: host, family: net.isIPv6(host) ? 6 : 4 };
  }
  const addrs = await dns.lookup(host, { all: true, verbatim: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error('webhook url resolves to a private address');
  }
  // Pin one address from the validated answer into the socket lookup. The
  // HTTP client must not resolve the hostname again: doing so leaves a DNS
  // rebinding window between validation and connection.
  return { url: u, address: addrs[0].address, family: addrs[0].family };
}

function postPinned(target, { headers, body, timeoutMs = 10_000 }) {
  const transport = target.url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request(target.url, {
      method: 'POST',
      headers,
      lookup: (_hostname, _options, callback) => callback(null, target.address, target.family),
      timeout: timeoutMs,
      agent: false,
    }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode || 0 }));
    });
    req.on('timeout', () => req.destroy(new Error('webhook request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

const ATTEMPT_DELAYS_MS = [30_000, 120_000, 600_000, 3_600_000, 21_600_000];
const MAX_ATTEMPTS = ATTEMPT_DELAYS_MS.length;
const TICK_MS = 15_000;
const AUTO_DISABLE_AFTER = 20;

let timer = null;

async function enqueueWebhookEvent(userId, event, payload) {
  const hooks = await prisma.webhook.findMany({
    where: { userId, active: true },
  });
  for (const h of hooks) {
    let events = []; try { events = JSON.parse(h.events); } catch {}
    if (!events.includes('*') && !events.includes(event)) continue;
    await prisma.webhookDelivery.create({
      data: {
        webhookId: h.id, event,
        payload: JSON.stringify(payload),
        status: 'pending', attemptCount: 0,
        nextAttemptAt: new Date(),
      },
    });
  }
}

function sign(secret, body, ts) {
  return crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
}

async function deliverOne(delivery) {
  const hook = await prisma.webhook.findUnique({ where: { id: delivery.webhookId } });
  if (!hook || !hook.active) {
    await prisma.webhookDelivery.update({ where: { id: delivery.id },
      data: { status: 'dead', lastError: 'webhook inactive' } });
    return;
  }
  const ts = Date.now().toString();
  const sig = sign(hook.secret, delivery.payload, ts);
  let res, errText = null;
  try {
    const target = await assertPublicUrl(hook.url);
    res = await postPinned(target, {
      headers: {
        'content-type': 'application/json',
        'x-webhook-event': delivery.event,
        'x-webhook-timestamp': ts,
        'x-webhook-signature': `t=${ts},v1=${sig}`,
        'user-agent': 'verifica-webhook/1.0',
      },
      body: delivery.payload,
    });
  } catch (err) { errText = err.message; }

  const ok = res && res.status >= 200 && res.status < 300;
  const nextCount = delivery.attemptCount + 1;

  if (ok) {
    await prisma.$transaction([
      prisma.webhookDelivery.update({ where: { id: delivery.id },
        data: { status: 'delivered', deliveredAt: new Date(), attemptCount: nextCount } }),
      prisma.webhook.update({ where: { id: hook.id }, data: { failureCount: 0 } }),
    ]);
    metrics.counters.webhookDeliveries.inc({ outcome: 'delivered' });
    return;
  }

  const failureMsg = errText || `HTTP ${res ? res.status : '???'}`;
  if (nextCount >= MAX_ATTEMPTS) {
    const newFail = hook.failureCount + 1;
    const updates = [
      prisma.webhookDelivery.update({ where: { id: delivery.id },
        data: { status: 'dead', attemptCount: nextCount, lastError: failureMsg } }),
      prisma.webhook.update({ where: { id: hook.id }, data: { failureCount: newFail } }),
    ];
    if (newFail >= AUTO_DISABLE_AFTER) {
      updates.push(prisma.webhook.update({ where: { id: hook.id },
        data: { active: false, disabledAt: new Date() } }));
    }
    await prisma.$transaction(updates);
    metrics.counters.webhookDeliveries.inc({ outcome: 'dead' });
  } else {
    await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: {
      status: 'pending', attemptCount: nextCount, lastError: failureMsg,
      nextAttemptAt: new Date(Date.now() + ATTEMPT_DELAYS_MS[nextCount - 1]),
    }});
    metrics.counters.webhookDeliveries.inc({ outcome: 'retry' });
  }
}

async function tick() {
  try {
    const due = await prisma.webhookDelivery.findMany({
      where: { status: 'pending', nextAttemptAt: { lte: new Date() } },
      take: 25, orderBy: { nextAttemptAt: 'asc' },
    });
    for (const d of due) { await deliverOne(d).catch(e => console.error('webhook deliver:', e.message)); }
  } catch (err) { console.error('webhook tick:', err.message); }
}

function startWebhookWorker() {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
  timer.unref && timer.unref();
}
function stopWebhookWorker() { if (timer) { clearInterval(timer); timer = null; } }

module.exports = { enqueueWebhookEvent, startWebhookWorker, stopWebhookWorker, sign, assertPublicUrl, postPinned };

