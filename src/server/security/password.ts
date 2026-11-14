/**
 * NEXORA Security Foundation
 * Argon2id Password Hashing & Strength Verification
 *
 * Uses OWASP-recommended Argon2id parameters:
 * - Variant: argon2id (hybrid side-channel & GPU/ASIC resistance)
 * - Memory: 64 MiB (65536 KiB)
 * - Iterations: 3
 * - Parallelism: 1
 */

import argon2, { type HashOptions } from 'argon2';

const ARGON2_OPTIONS: HashOptions & { raw: false } = {
  type: argon2.argon2id as 2,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
  raw: false,
};

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128; // Prevents CPU/Memory DoS via giant password strings

export interface PasswordStrengthResult {
  valid: boolean;
  score: number; // 0 to 4
  reasons: string[];
}

export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const reasons: string[] = [];

  if (typeof password !== 'string') {
    return { valid: false, score: 0, reasons: ['Password must be a string.'] };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    reasons.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    reasons.push(`Password cannot exceed ${MAX_PASSWORD_LENGTH} characters.`);
  }
  if (!/[a-z]/.test(password)) {
    reasons.push('Must contain at least one lowercase letter.');
  }
  if (!/[A-Z]/.test(password)) {
    reasons.push('Must contain at least one uppercase letter.');
  }
  if (!/[0-9]/.test(password)) {
    reasons.push('Must contain at least one numeric digit.');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    reasons.push('Must contain at least one special character.');
  }

  const passedChecks = 4 - Math.min(4, reasons.length);
  return {
    valid: reasons.length === 0,
    score: passedChecks,
    reasons,
  };
}

export async function hashPassword(plainPassword: string): Promise<string> {
  if (!plainPassword || plainPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (plainPassword.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`Password cannot exceed ${MAX_PASSWORD_LENGTH} characters.`);
  }
  return argon2.hash(plainPassword, ARGON2_OPTIONS);
}

export async function verifyPassword(storedHash: string, candidatePassword: string): Promise<boolean> {
  if (!storedHash || !candidatePassword || candidatePassword.length > MAX_PASSWORD_LENGTH) {
    return false;
  }
  try {
    return await argon2.verify(storedHash, candidatePassword);
  } catch {
    return false;
  }
}

export function needsPasswordRehash(storedHash: string): boolean {
  try {
    return argon2.needsRehash(storedHash, ARGON2_OPTIONS);
  } catch {
    return true;
  }
}
