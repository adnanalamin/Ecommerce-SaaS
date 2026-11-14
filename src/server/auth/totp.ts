/**
 * NEXORA Authentication Engine
 * RFC 6238 TOTP MFA & Single-Use Backup Codes (Pure node:crypto)
 */

import { createHmac, randomBytes } from 'node:crypto';
import { createHmacSignature, constantTimeEquals } from '../security/secrets.ts';
import { env } from '../../../packages/config/src/index.ts';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) {
      throw new Error('Invalid Base32 TOTP secret character.');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20)); // 160-bit secret per RFC 4226/6238
}

export function buildTotpOtpAuthUri(params: { secret: string; email: string; issuer?: string }): string {
  const issuer = params.issuer ?? 'NEXORA';
  const label = encodeURIComponent(`${issuer}:${params.email}`);
  return `otpauth://totp/${label}?secret=${params.secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export function generateTotpCode(secretBase32: string, timestampMs = Date.now(), stepSeconds = 30): string {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(timestampMs / 1000 / stepSeconds);

  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binaryCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binaryCode % 1_000_000;
  return otp.toString().padStart(6, '0');
}

export function verifyTotpCode(
  secretBase32: string,
  candidateCode: string,
  windowSteps = 1,
  timestampMs = Date.now()
): boolean {
  const cleanCode = candidateCode.trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    return false;
  }

  for (let delta = -windowSteps; delta <= windowSteps; delta++) {
    const stepMs = timestampMs + delta * 30_000;
    const expected = generateTotpCode(secretBase32, stepMs);
    if (constantTimeEquals(expected, cleanCode)) {
      return true;
    }
  }
  return false;
}

export function normalizeBackupCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashBackupCode(code: string): string {
  return createHmacSignature(`backup:${normalizeBackupCode(code)}`, env.ENCRYPTION_MASTER_KEY);
}

export function generateBackupCodes(count = 8): { plaintextCodes: string[]; hashedCodes: string[] } {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes ambiguous O/0/1/I
  const plaintextCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8);
    let raw = '';
    for (let j = 0; j < 8; j++) {
      raw += charset[bytes[j] % charset.length];
    }
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    plaintextCodes.push(formatted);
    hashedCodes.push(hashBackupCode(formatted));
  }

  return { plaintextCodes, hashedCodes };
}
