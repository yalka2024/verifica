// Offline-first request queue for Verifica — IndexedDB-backed so
// queued submissions survive a page reload, not just an in-memory array.
//
// Usage (see src/api.js): a write request that fails because the browser is
// genuinely offline (not a server error — a real network failure) is handed
// to `enqueue()` instead of throwing. `autoFlushOnReconnect()` retries every
// queued request, in submission order, the moment the browser's `online`
// event fires; a request is only removed from the queue once its retry
// actually succeeds. If a retry fails, the flush stops there — it does not
// skip ahead and reorder pending writes.
'use strict';

const DB_NAME = 'verifica-offline-queue';
const STORE = 'pending';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

/** Queue a request descriptor: { url, method, headers, body }. */
export async function enqueue(request) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, 'readwrite');
    const req = store.add({ ...request, queuedAt: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function count() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAll(db) {
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function remove(db, id) {
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

let flushing = false;

/**
 * Retry every queued request via `sender(item) => Promise<Response>`, oldest
 * first. Stops at the first failure so a still-down network doesn't burn
 * through the whole queue out of order.
 */
export async function flush(sender) {
  if (flushing) return { flushed: 0, remaining: await count().catch(() => 0) };
  flushing = true;
  let flushed = 0;
  try {
    const db = await openDB();
    const items = (await getAll(db)).sort((a, b) => a.queuedAt - b.queuedAt);
    for (const item of items) {
      try {
        const res = await sender(item);
        if (res && 'ok' in res && res.ok === false) throw new Error('queued request still failing');
        await remove(db, item.id);
        flushed++;
      } catch {
        break;
      }
    }
  } finally {
    flushing = false;
  }
  return { flushed, remaining: await count().catch(() => 0) };
}

let wired = false;

/** Idempotent: safe to call from multiple modules, only wires one listener. */
export function autoFlushOnReconnect(sender) {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  window.addEventListener('online', () => { flush(sender).catch(() => {}); });
  if (navigator.onLine) flush(sender).catch(() => {}); // reconnected before this module loaded
}

