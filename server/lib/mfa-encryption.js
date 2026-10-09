'use strict';
const crypto = require('crypto');
const legacy = require('./encryption');

const PREFIX = 'mfa1';
function key(raw, label) {
  if (!raw) return null;
  if (String(raw).length < 32) throw new Error(`${label} must be at least 32 characters`);
  return crypto.createHash('sha256').update(String(raw), 'utf8').digest();
}
function keys() {
  const primaryRaw = process.env.MFA_ENCRYPTION_KEY || (process.env.NODE_ENV === 'production' ? null : `${process.env.JWT_SECRET || 'development'}-mfa-key-material`);
  const primary = key(primaryRaw, 'MFA_ENCRYPTION_KEY');
  if (!primary) throw new Error('MFA_ENCRYPTION_KEY is required in production');
  return [primary, key(process.env.MFA_ENCRYPTION_KEY_OLD, 'MFA_ENCRYPTION_KEY_OLD')].filter(Boolean);
}
function encryptMfaSecret(value) {
  if (value == null) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keys()[0], iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `${PREFIX}:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ciphertext.toString('base64url')}`;
}
function decryptMfaSecret(value) {
  if (value == null || typeof value !== 'string') return value;
  if (value.startsWith('v1:')) return legacy.decrypt(value);
  const parts = value.split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) return value;
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const ciphertext = Buffer.from(parts[3], 'base64url');
  for (const candidate of keys()) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', candidate, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch { /* try the old rotation key */ }
  }
  throw new Error('MFA secret decryption failed for every configured key');
}
module.exports = { encryptMfaSecret, decryptMfaSecret };

