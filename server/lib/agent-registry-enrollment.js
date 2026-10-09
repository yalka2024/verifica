'use strict';

// Opt-in outbound enrollment for Kubild-generated platforms. Setting one
// Registry URL publishes only the already-public manifest URL. No credentials,
// tenant data, records, or prompts leave the platform through this mechanism.
let timer = null;
let running = false;

function settings() {
  const registry = String(process.env.KUBILD_AGENT_REGISTRY_URL || '').replace(/\/$/, '');
  const publicUrl = String(process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const requested = Number(process.env.AGENT_REGISTRY_ENROLL_INTERVAL_MS || 21_600_000);
  return { registry, publicUrl, interval: Math.max(300_000, Number.isFinite(requested) ? requested : 21_600_000) };
}

async function enroll() {
  if (running) return { skipped: 'already_running' };
  const { registry, publicUrl } = settings();
  if (!registry) return { skipped: 'registry_not_configured' };
  if (!/^https:\/\//i.test(registry)) throw new Error('KUBILD_AGENT_REGISTRY_URL must use HTTPS');
  if (!/^https:\/\//i.test(publicUrl)) throw new Error('PUBLIC_URL must use HTTPS for Registry enrollment');
  running = true;
  try {
    const response = await fetch(`${registry}/v1/discovery/submissions`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { 'content-type': 'application/json', 'user-agent': 'kubild-generated-platform/1.0' },
      body: JSON.stringify({ manifest_url: `${publicUrl}/.well-known/agent-manifest.json` }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Registry enrollment failed (${response.status}): ${payload.error || 'unknown_error'}`);
    console.log(`[agent-registry] indexed ${publicUrl} as source ${payload.source_id}`);
    return payload;
  } finally { running = false; }
}

function startScheduler() {
  const { registry, interval } = settings();
  if (!registry || timer) return;
  enroll().catch((error) => console.error(`[agent-registry] ${error.message}`));
  timer = setInterval(() => enroll().catch((error) => console.error(`[agent-registry] ${error.message}`)), interval);
  timer.unref?.();
}

function stopScheduler() { if (timer) clearInterval(timer); timer = null; }

module.exports = { enroll, startScheduler, stopScheduler };

