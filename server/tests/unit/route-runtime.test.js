'use strict';

const fs = require('fs');
const path = require('path');

function mockModelDouble() {
  return new Proxy({}, {
    get(_target, operation) {
      return jest.fn(async (args = {}) => {
        if (operation === 'findMany') return [];
        if (operation === 'count') return 0;
        if (operation === 'aggregate') return { _sum: {}, _avg: {}, _count: 0 };
        if (operation === 'groupBy') return [];
        if (operation === 'findUnique' || operation === 'findFirst') return null;
        if (operation === 'deleteMany' || operation === 'updateMany') return { count: 0 };
        return { id: 'fixture-id', ...(args.data || {}) };
      });
    },
  });
}

const mockPrismaDouble = new Proxy({}, {
  get(_target, model) {
    if (model === '$transaction') {
      return async work => typeof work === 'function'
        ? work(mockPrismaDouble)
        : Promise.all(work || []);
    }
    if (model === '$queryRaw' || model === '$executeRaw') return jest.fn(async () => []);
    if (model === '$connect' || model === '$disconnect') return jest.fn(async () => undefined);
    return mockModelDouble();
  },
});
jest.mock('../../lib/prisma', () => mockPrismaDouble);
// Route contracts must never deliver real mail or leave fire-and-forget provider
// work behind after a handler settles.
const mockEmail = new Proxy({}, { get: () => jest.fn(async () => ({ ok: true })) });
jest.mock('../../lib/email', () => mockEmail);

const routeDir = path.resolve(__dirname, '../../routes');
const routeFiles = fs.readdirSync(routeDir).filter(name => name.endsWith('.js')).sort();

function requestFor(method) {
  return {
    method: method.toUpperCase(), originalUrl: '/runtime-contract', path: '/runtime-contract',
    baseUrl: '/api', protocol: 'https', secure: true, hostname: 'example.test', ip: '127.0.0.1',
    headers: {}, cookies: {}, signedCookies: {}, query: {}, params: { id: 'fixture-id', slug: 'fixture' },
    body: {
      id: 'fixture-id', name: 'Fixture', title: 'Fixture', message: 'Fixture', description: 'Fixture',
      email: 'fixture@example.com', password: 'StrongFixturePassword123!', role: 'admin',
      status: 'open', severity: 'sev3', type: 'fixture', action: 'fixture', content: 'Fixture',
      input: 'Fixture', objective: 'Fixture', prompt: 'Fixture', amount: 100, amountCents: 100,
      currency: 'usd', items: [{ description: 'Fixture', amountCents: 100, qty: 1 }],
    },
    user: { id: 'fixture-user', email: 'fixture@example.com', role: 'admin', orgId: 'fixture-org' },
    tenant: { orgId: 'fixture-org', planId: 'enterprise' },
    authMode: 'cookie', authScopes: ['*'],
    get(name) { return this.headers[String(name).toLowerCase()]; },
    header(name) { return this.get(name); },
  };
}

function invoke(handle, method) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let responseSent = false;
    let timer;
    const finish = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('generated route handler did not settle within 2 seconds'));
      }
    }, 2000);
    // Sending a response does not mean an async Express handler has completed:
    // it may still be awaiting audit/email/cleanup work. Record the response,
    // then wait for the returned promise so tests cannot leak work into Jest's
    // next test (or beyond suite shutdown).
    const terminal = () => { responseSent = true; return res; };
    const res = {
      locals: {}, headers: {}, statusCode: 200, headersSent: false,
      status(code) { this.statusCode = code; return this; },
      setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
      getHeader(name) { return this.headers[String(name).toLowerCase()]; },
      header(name, value) { this.setHeader(name, value); return this; },
      cookie() { return this; }, clearCookie() { return this; }, type() { return this; },
      json: terminal, send: terminal, end: terminal, redirect: terminal, download: terminal,
      write() { return true; }, flushHeaders() {},
    };
    const next = error => { clearTimeout(timer); finish(error || 'next'); };
    try {
      const result = handle(requestFor(method), res, next);
      if (result && typeof result.then === 'function') result.then(() => finish('resolved'), reject);
      else if (responseSent) finish('response');
    } catch (error) {
      clearTimeout(timer);
      resolve(error);
    }
  });
}

describe('every emitted API handler has a runtime contract', () => {
  const cases = [];
  for (const routeFile of routeFiles) {
    const router = require(path.join(routeDir, routeFile));
    for (const layer of router.stack || []) {
      if (layer.route) {
        const method = Object.keys(layer.route.methods || {})[0] || 'get';
        for (let index = 0; index < layer.route.stack.length; index++) {
          cases.push([`${routeFile} ${method.toUpperCase()} ${layer.route.path} handler ${index + 1}`,
            layer.route.stack[index].handle, method]);
        }
      } else if (typeof layer.handle === 'function') {
        cases.push([`${routeFile} router middleware`, layer.handle, 'get']);
      }
    }
  }

  test('discovers a substantial generated handler surface', () => {
    expect(cases.length).toBeGreaterThan(routeFiles.length);
  });

  test.each(cases)('%s settles within the isolated contract', async (_label, handle, method) => {
    const result = await invoke(handle, method);
    expect(result).toBeDefined();
  });
});

