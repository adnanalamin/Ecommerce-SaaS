/**
 * NEXORA Security Foundation
 * CSRF Protection Strategy (Signed Double-Submit Cookie + Fetch-Metadata Check)
 *
 * Strategy:
 * 1. Read-only safe methods (GET, HEAD, OPTIONS) bypass CSRF checks.
 * 2. Pure stateless Bearer-token API requests (Authorization: Bearer ...) without auth cookies
 *    are inherently immune to CSRF and allowed.
 * 3. Webhook routes with cryptographic HMAC provider signatures bypass CSRF.
 * 4. Cookie-authenticated state-changing requests (POST, PUT, PATCH, DELETE) must present
 *    an X-CSRF-Token header signed by CSRF_SECRET matching the nexora_csrf cookie.
 */

import { randomBytes } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { env } from '../../../packages/config/src/index.ts';
import { createHmacSignature, constantTimeEquals } from '../security/secrets.ts';
import { getSecureCookieOptions } from '../security/cookies.ts';
import { logSecurityEvent } from '../security/securityLogger.ts';
import { sendError } from '../utils/apiResponse.ts';
import { getRequestContext } from './requestContext.ts';

export const CSRF_COOKIE_NAME = 'nexora_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function generateCsrfTokenPair(): { rawToken: string; signedToken: string } {
  const rawToken = randomBytes(24).toString('hex');
  const signature = createHmacSignature(rawToken, env.CSRF_SECRET);
  return {
    rawToken,
    signedToken: `${rawToken}.${signature}`,
  };
}

export function verifyCsrfToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [rawToken, providedSig] = parts;
  if (!rawToken || !providedSig) return false;
  const expectedSig = createHmacSignature(rawToken, env.CSRF_SECRET);
  return constantTimeEquals(providedSig, expectedSig);
}

export function issueCsrfCookie(res: Response): string {
  const { signedToken } = generateCsrfTokenPair();
  res.cookie(
    CSRF_COOKIE_NAME,
    signedToken,
    getSecureCookieOptions({
      httpOnly: false, // Must be readable by SPA client to echo in X-CSRF-Token header
      signed: false,
      sameSite: 'lax',
      maxAgeMs: 24 * 60 * 60 * 1000,
    })
  );
  return signedToken;
}

export function csrfProtectionMiddleware(
  options: { enforceAlways?: boolean } = {}
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      return next();
    }

    // Sec-Fetch-Site defense-in-depth: block obvious cross-site browser requests
    const fetchSite = (req.headers['sec-fetch-site'] as string | undefined)?.toLowerCase();
    if (fetchSite === 'cross-site' && !req.originalUrl.startsWith('/api/v1/webhooks')) {
      logSecurityEvent({
        eventType: 'CSRF_VALIDATION_FAILED',
        severity: 'HIGH',
        message: 'Blocked cross-site state-changing request via Sec-Fetch-Site.',
        metadata: { fetchSite },
      });
      sendError(res, 403, 'CSRF_CROSS_SITE_BLOCKED', 'Cross-site state-changing request rejected.');
      return;
    }

    // Stateless Authorization Bearer API requests without session cookies bypass CSRF
    const hasBearer = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ');
    const hasSessionCookie = Boolean(
      req.cookies?.nexora_session ||
        req.signedCookies?.nexora_session ||
        req.signedCookies?.['__Host-nexora_session'] ||
        req.cookies?.nexora_refresh ||
        req.signedCookies?.nexora_refresh ||
        req.signedCookies?.['__Host-nexora_refresh']
    );

    if (!options.enforceAlways && hasBearer && !hasSessionCookie) {
      return next();
    }

    // If neither session cookie nor enforceAlways is active (e.g. initial unauthenticated public calls), allow unless CSRF cookie was supplied
    if (!options.enforceAlways && !hasSessionCookie && !req.cookies?.[CSRF_COOKIE_NAME]) {
      return next();
    }

    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;
    const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;

    if (!cookieToken || !headerToken || !constantTimeEquals(cookieToken, headerToken) || !verifyCsrfToken(headerToken)) {
      const ctx = getRequestContext();
      logSecurityEvent({
        eventType: 'CSRF_VALIDATION_FAILED',
        severity: 'HIGH',
        message: 'CSRF token missing, mismatched, or invalid signature.',
        metadata: { hasCookie: Boolean(cookieToken), hasHeader: Boolean(headerToken) },
      });

      sendError(
        res,
        403,
        'CSRF_TOKEN_INVALID',
        'Invalid or missing CSRF security token.',
        undefined,
        ctx?.requestId
      );
      return;
    }

    next();
  };
}
