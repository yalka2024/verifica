// Test environment defaults — runs before any test file is required.
process.env.NODE_ENV = 'test';
// Preserve whether the caller supplied a real integration database. Unit tests
// get a deterministic placeholder URL, while DB-backed suites skip honestly
// unless CI/the operator explicitly provides PostgreSQL.
process.env.KUBILD_TEST_DATABASE_AVAILABLE = process.env.DATABASE_URL ? '1' : '0';
process.env.JWT_SECRET = process.env.JWT_SECRET
  || 'test-jwt-secret-must-be-at-least-32-characters-long-x';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://generated:generated@localhost:5432/generated';
process.env.AUDIT_HMAC_KEY = process.env.AUDIT_HMAC_KEY || 'test-audit-hmac-key-that-is-at-least-32-chars';
process.env.MFA_ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY || 'test-mfa-encryption-key-that-is-at-least-32-chars';
process.env.STORAGE_DRIVER = process.env.STORAGE_DRIVER || 'local';
process.env.STORAGE_LOCAL_DIR = process.env.STORAGE_LOCAL_DIR || './uploads-test';
process.env.AI_DAILY_TOKEN_LIMIT = process.env.AI_DAILY_TOKEN_LIMIT || '1000000';
process.env.LOGIN_MAX_FAILED = process.env.LOGIN_MAX_FAILED || '999';

