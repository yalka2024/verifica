'use strict';
const { spawn, spawnSync } = require('child_process');
const { mkdtempSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const path = require('path');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const work = mkdtempSync(path.join(tmpdir(), 'kubild-generated-runtime-'));
const port = String(46000 + Math.floor(Math.random() * 1000));
const serverRoot = path.join(__dirname, '..');
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('postgres')) {
  console.error('test:runtime requires an ephemeral PostgreSQL DATABASE_URL');
  process.exit(1);
}
const env = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: port,
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: 'runtime-smoke-jwt-secret-that-is-longer-than-32-chars',
  MFA_ENCRYPTION_KEY: 'runtime-smoke-mfa-key-that-is-longer-than-32-chars',
  AUDIT_HMAC_KEY: 'runtime-smoke-audit-key-that-is-longer-than-32-chars',
};

function fail(message, child) {
  if (child && !child.killed) child.kill();
  rmSync(work, { recursive: true, force: true });
  console.error(message);
  process.exit(1);
}
function cleanup() {
  rmSync(work, { recursive: true, force: true });
}

const push = spawnSync(npm, ['run', 'db:migrate'], {
  cwd: serverRoot, env, encoding: 'utf8', shell: process.platform === 'win32',
});
if (push.status !== 0) fail(`runtime migration deploy failed\n${push.stdout}\n${push.stderr}`);
for (const script of ['db:rls', 'db:seed']) {
  const setup = spawnSync(npm, ['run', script], { cwd: serverRoot, env, encoding: 'utf8', shell: process.platform === 'win32' });
  if (setup.status !== 0) fail(`runtime ${script} failed\n${setup.stdout}\n${setup.stderr}`);
}

const child = spawn(process.execPath, ['index.js'], { cwd: serverRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
child.stdout.on('data', (chunk) => { logs += chunk; });
child.stderr.on('data', (chunk) => { logs += chunk; });

(async () => {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) fail(`server exited before readiness (${child.exitCode})\n${logs}`, child);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health/ready`);
      if (response.ok) {
        child.kill('SIGTERM');
        await new Promise((resolve) => child.once('exit', resolve));
        cleanup();
        console.log('generated runtime boot/readiness/shutdown smoke passed');
        return;
      }
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail(`server did not become ready within 20 seconds\n${logs}`, child);
})().catch((err) => fail(err.stack || err.message, child));

