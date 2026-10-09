'use strict';
/** Always run the runtime smoke against an isolated PostgreSQL database. */
const { randomUUID } = require('crypto');
const { spawnSync } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..');
const node = process.execPath;

function run(command, args, options = {}) { return spawnSync(command, args, { encoding: 'utf8', stdio: 'pipe', ...options }); }
if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres')) {
  const result = run(node, ['scripts/runtime-smoke.js'], { cwd: root, env: process.env, stdio: 'inherit' });
  process.exit(result.status == null ? 1 : result.status);
}

const name = `kubild-runtime-${randomUUID()}`;
let started = false;
try {
  const start = run('docker', ['run', '-d', '--rm', '--name', name, '-e', 'POSTGRES_USER=kubild', '-e', 'POSTGRES_PASSWORD=kubild-runtime', '-e', 'POSTGRES_DB=kubild_runtime', '-p', '127.0.0.1::5432', 'postgres:16']);
  if (start.status !== 0) throw new Error(`isolated PostgreSQL unavailable: ${start.stderr || start.stdout}`);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const probe = run('docker', ['exec', name, 'pg_isready', '-U', 'kubild', '-d', 'kubild_runtime']);
    if (probe.status === 0) { ready = true; break; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  if (!ready) throw new Error('isolated PostgreSQL did not become ready');
  const portResult = run('docker', ['port', name, '5432/tcp']);
  const match = String(portResult.stdout).match(/:(\d+)\s*$/m);
  if (!match) throw new Error(`could not resolve isolated PostgreSQL port: ${portResult.stdout}`);
  const env = { ...process.env, DATABASE_URL: `postgresql://kubild:kubild-runtime@127.0.0.1:${match[1]}/kubild_runtime` };
  const smoke = run(node, ['scripts/runtime-smoke.js'], { cwd: root, env, stdio: 'inherit' });
  if (smoke.status !== 0) process.exitCode = smoke.status == null ? 1 : smoke.status;
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
} finally {
  if (started) run('docker', ['stop', name]);
}

