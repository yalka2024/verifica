'use strict';

describe('dedicated MFA secret encryption', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
    jest.resetModules();
  });

  test('uses a dedicated authenticated envelope and rejects tampering', () => {
    process.env.MFA_ENCRYPTION_KEY = 'primary-mfa-key-that-is-at-least-32-characters';
    const { encryptMfaSecret, decryptMfaSecret } = require('../../lib/mfa-encryption');
    const envelope = encryptMfaSecret('JBSWY3DPEHPK3PXP');
    expect(envelope).toMatch(/^mfa1:/);
    expect(decryptMfaSecret(envelope)).toBe('JBSWY3DPEHPK3PXP');
    const parts = envelope.split(':');
    const tag = Buffer.from(parts[2], 'base64url');
    tag[0] ^= 0x01;
    parts[2] = tag.toString('base64url');
    expect(() => decryptMfaSecret(parts.join(':'))).toThrow();
  });

  test('decrypts with the old key during rotation but writes with the primary key', () => {
    process.env.MFA_ENCRYPTION_KEY = 'old-mfa-key-that-is-at-least-32-characters-long';
    let helper = require('../../lib/mfa-encryption');
    const oldEnvelope = helper.encryptMfaSecret('rotation-secret');
    jest.resetModules();
    process.env.MFA_ENCRYPTION_KEY_OLD = process.env.MFA_ENCRYPTION_KEY;
    process.env.MFA_ENCRYPTION_KEY = 'new-mfa-key-that-is-at-least-32-characters-long';
    helper = require('../../lib/mfa-encryption');
    expect(helper.decryptMfaSecret(oldEnvelope)).toBe('rotation-secret');
    expect(helper.encryptMfaSecret('new-secret')).toMatch(/^mfa1:/);
  });
});

