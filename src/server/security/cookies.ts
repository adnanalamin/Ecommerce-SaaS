/**
 * NEXORA Security Foundation
 * Secure Cookie Configuration Helpers
 */

import { CookieOptions, Response } from 'express';
import { env } from '../../../packages/config/src/index.ts';

export interface SecureCookieConfigOptions {
  maxAgeMs?: number;
  sameSite?: 'strict' | 'lax' | 'none';
  httpOnly?: boolean;
  signed?: boolean;
  path?: string;
}

export function getSecureCookieOptions(overrides: SecureCookieConfigOptions = {}): CookieOptions {
  const isProduction = env.NODE_ENV === 'production';
  const sameSite = overrides.sameSite ?? 'lax';

  // Browsers reject SameSite=None unless Secure=true
  const forceSecure = isProduction || sameSite === 'none';

  return {
    httpOnly: overrides.httpOnly ?? true,
    secure: forceSecure,
    sameSite,
    path: overrides.path ?? '/',
    signed: overrides.signed ?? true,
    maxAge: overrides.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000, // 7 days default
  };
}

export function setSecureAuthCookie(
  res: Response,
  name: string,
  value: string,
  maxAgeMs: number
): void {
  const cookieName = env.NODE_ENV === 'production' ? `__Host-${name}` : name;
  res.cookie(
    cookieName,
    value,
    getSecureCookieOptions({
      httpOnly: true,
      sameSite: 'lax',
      signed: true,
      maxAgeMs,
      path: '/',
    })
  );
}

export function clearSecureAuthCookie(res: Response, name: string): void {
  const cookieName = env.NODE_ENV === 'production' ? `__Host-${name}` : name;
  res.clearCookie(cookieName, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}
