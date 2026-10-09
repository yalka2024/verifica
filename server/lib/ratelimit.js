/**
 * Rate limiting — Redis-backed when REDIS_URL is set, else in-process LRU.
 * Per-route + per-identity (user id when authed, IP otherwise).
 */
const rateLimit = require('express-rate-limit');

let RedisStoreCtor = null;
let redisClient = null;
if (process.env.REDIS_URL) {
  try {
    RedisStoreCtor = require('rate-limit-redis').default || require('rate-limit-redis');
    const IORedis = require('ioredis');
    redisClient = new IORedis(process.env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 2 });
    console.log('rate-limit: using Redis store');
  } catch (err) {
    console.warn('rate-limit: REDIS_URL set but redis store unavailable, falling back to memory:', err.message);
  }
}

function keyByIdentity(req) {
  return (req.user && req.user.id) ? `u:${req.user.id}` : `ip:${req.ip}`;
}

function makeLimiter({ windowMs, max, name }) {
  // express-rate-limit v7 forbids sharing one Store instance across limiters
  // (ERR_ERL_STORE_REUSE) — each limiter gets its own Store, sharing only the
  // underlying Redis connection, namespaced by its own prefix.
  const store = RedisStoreCtor
    ? new RedisStoreCtor({ sendCommand: (...args) => redisClient.call(...args), prefix: `rl:${name}:` })
    : undefined;
  return rateLimit({
    windowMs, max, store,
    standardHeaders: true, legacyHeaders: false,
    keyGenerator: req => `${name}:${keyByIdentity(req)}`,
    message: { error: 'Too many requests' },
  });
}

module.exports = {
  global:  makeLimiter({ windowMs: 60_000,    max: 600, name: 'global' }),
  auth:    makeLimiter({ windowMs: 15 * 60_000, max: 20,  name: 'auth' }),
  upload:  makeLimiter({ windowMs: 60_000,    max: 30,  name: 'upload' }),
  ai:      makeLimiter({ windowMs: 60_000,    max: 20,  name: 'ai' }),
  expensive: makeLimiter({ windowMs: 60_000,  max: 10,  name: 'expensive' }),
  publicBehavior: makeLimiter({ windowMs: 60_000, max: 30, name: 'public-behavior' }),
  makeLimiter,
};

