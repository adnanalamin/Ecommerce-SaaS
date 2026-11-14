/**
 * NEXORA Security Foundation
 * Secret Management, AES-256-GCM Encryption & Timing-Safe HMAC Utilities
 */

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '../../../packages/config/src/index.ts';

const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // NIST SP 800-38D standard 96-bit IV for GCM

function getMasterKeyBuffer(): Buffer {
  const key = Buffer.from(env.ENCRYPTION_MASTER_KEY, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_MASTER_KEY must decode to exactly 32 bytes (256 bits).');
  }
  return key;
}

/**
 * Encrypts sensitive tenant/user secrets (e.g., MFA TOTP secrets, payment gateway secrets, dedicated DB URIs)
 * Output format: v1:<ivHex>:<authTagHex>:<cipherTextHex>
 */
export function encryptSecret(plainText: string, associatedData?: string): string {
  const key = getMasterKeyBuffer();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, key, iv);

  if (associatedData) {
    cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  }

  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts AES-256-GCM encrypted secrets with authenticated integrity check.
 */
export function decryptSecret(cipherPayload: string, associatedData?: string): string {
  const parts = cipherPayload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Invalid encrypted secret format.');
  }

  const [, ivHex, tagHex, encryptedHex] = parts;
  const key = getMasterKeyBuffer();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = createDecipheriv(AES_ALGORITHM, key, iv);
  if (associatedData) {
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
  }
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Constant-time string comparison preventing timing side-channel attacks.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Generates HMAC-SHA256 signature for tokens, CSRF bindings, and webhook payloads.
 */
export function createHmacSignature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Masks sensitive keys for safe operational UI display (e.g. "sk_l****9f2a").
 */
export function maskSecret(secret: string, visibleTail = 4): string {
  if (!secret) return '****';
  if (secret.length <= visibleTail * 2) return '********';
  return `${secret.slice(0, 4)}****${secret.slice(-visibleTail)}`;
}
