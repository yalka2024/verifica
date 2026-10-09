/**
 * Agent memory — per-session conversational + working memory.
 *
 * remember(ns, role, content)  append a turn to a session's memory
 * recall(ns, query, k)         return the k most relevant/recent turns
 * history(ns, n)               last n turns verbatim
 *
 * DURABLE (inventory gap #4: this was a pure in-process Map that died on
 * restart): every turn is write-through persisted as a Prisma AgentMemoryEntry
 * row, and a session lazily HYDRATES from the database on its first access
 * after a boot — so an agent resumes a conversation across restarts. The
 * in-memory array remains the synchronous read path (agent-runtime calls
 * recall() synchronously mid-loop); hydration merges in the background, so the
 * first recall after a cold start may see only the current process's turns
 * until the (fast) load lands. Persistence failures degrade to memory-only
 * with a one-time warning — visible, never silent.
 */
const prisma = require('./prisma');
// The AgentMemoryEntry model is generated only for platforms WITH agents; this
// lib ships on every platform, so guard the delegate (memory-only otherwise).
const db = () => (prisma && prisma.agentMemoryEntry) || null;

const _mem = new Map();
const _hydrated = new Set();
const MAX = parseInt(process.env.AGENT_MEMORY_MAX || '200', 10);
let _warnedPersist = false;

function _ns(namespace) {
  const key = namespace || 'default';
  if (!_mem.has(key)) _mem.set(key, []);
  _hydrate(key);
  return _mem.get(key);
}

/** One background DB load per session per process; merges older turns in
 *  front of anything recorded since boot (dedupe by role+content+second). */
function _hydrate(key) {
  if (_hydrated.has(key)) return;
  _hydrated.add(key);
  const d = db();
  if (!d) return;
  d.findMany({ where: { session: key }, orderBy: { createdAt: 'desc' }, take: MAX })
    .then((rows) => {
      if (!rows.length) return;
      const arr = _mem.get(key) || [];
      const seen = new Set(arr.map((m) => `${m.role}|${m.content}|${Math.floor(m.ts / 1000)}`));
      const older = [];
      for (const r of rows.reverse()) {
        const ts = new Date(r.createdAt).getTime();
        const sig = `${r.role}|${r.content}|${Math.floor(ts / 1000)}`;
        if (!seen.has(sig)) older.push({ role: r.role, content: r.content, ts });
      }
      if (older.length) {
        arr.unshift(...older);
        while (arr.length > MAX) arr.shift();
      }
    })
    .catch(() => { /* hydration is best-effort; memory-only until DB returns */ });
}

function remember(namespace, role, content) {
  const key = namespace || 'default';
  const arr = _ns(key);
  const text = String(content == null ? '' : content).slice(0, 4000);
  arr.push({ role, content: text, ts: Date.now() });
  while (arr.length > MAX) arr.shift();
  // Write-through persistence (fire-and-forget: the agent loop never blocks on it).
  const d = db();
  if (d) d.create({ data: { session: key, role: String(role), content: text } }).catch((e) => {
    if (!_warnedPersist) {
      _warnedPersist = true;
      console.warn('[agent-memory] persistence unavailable — memory will not survive a restart:', e.message);
    }
  });
  return arr.length;
}

function _score(text, queryTokens) {
  const t = String(text).toLowerCase();
  let s = 0;
  for (const q of queryTokens) { if (q.length >= 3 && t.includes(q)) s++; }
  return s;
}

function recall(namespace, query, k = 5) {
  const arr = _ns(namespace);
  if (!arr.length) return [];
  const qt = (String(query || '').toLowerCase().match(/[a-z0-9]+/g) || []);
  // Relevance from keyword overlap; small recency boost so recent turns surface
  // when nothing matches strongly.
  const scored = arr.map((m, i) => ({ m, score: _score(m.content, qt) + (i / arr.length) * 0.5 }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, k)).map(s => s.m);
}

function history(namespace, n = 10) { return _ns(namespace).slice(-n); }
function clear(namespace) {
  const key = namespace || 'default';
  const a = _ns(key); const c = a.length; a.length = 0;
  const d = db();
  if (d) d.deleteMany({ where: { session: key } }).catch(() => {});
  return c;
}
function stats(namespace) { return { namespace: namespace || 'default', count: _ns(namespace).length }; }

module.exports = { remember, recall, history, clear, stats };

