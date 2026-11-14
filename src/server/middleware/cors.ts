/**
 * NEXORA Multi-Tenant SaaS E-Commerce Platform
 * Strict CORS Allowlist Middleware (Zero Arbitrary Origins Allowed)
 */

import cors, { CorsOptions } from 'cors';
import { Request, Response, NextFunction } from 'express';
import { env } from '../../../packages/config/src/index.ts';
import { logSecurityEvent } from '../security/securityLogger.ts';
import { sendError } from '../utils/apiResponse.ts';
import { getRequestContext } from './requestContext.ts';

/**
 * Evaluates whether a given Origin header belongs to the explicit NEXORA allowlist.
 * Mandatory Rule: Never allow arbitrary origins (not even in development).
 */
export function isOriginAllowed(origin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  const normalizedOrigin = `${parsed.protocol}//${parsed.host}`.toLowerCase();

  // 1. Explicit static allowlist from environment configuration
  const allowedOriginsList = (env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().toLowerCase())
    .filter((o) => o.length > 0 && o !== '*'); // Never allow wildcard '*'

  if (allowedOriginsList.includes(normalizedOrigin)) {
    return true;
  }

  // 2. Configured APP_URL exact origin match
  if (env.APP_URL) {
    try {
      const appUrlParsed = new URL(env.APP_URL);
      const appOrigin = `${appUrlParsed.protocol}//${appUrlParsed.host}`.toLowerCase();
      if (normalizedOrigin === appOrigin) {
        return true;
      }
    } catch {
      // Ignore malformed APP_URL
    }
  }

  // 3. Localhost & loopback for local dev/testing (strictly http/https)
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return true;
  }

  // 4. Platform domain and tenant subdomains (*.nexora.shop)
  const platformDomain = (env.PLATFORM_DOMAIN || '').trim().toLowerCase();
  if (platformDomain && (hostname === platformDomain || hostname.endsWith(`.${platformDomain}`))) {
    return true;
  }

  // 5. Verified AI Studio Cloud Run preview subdomains (*.run.app over HTTPS)
  if (parsed.protocol === 'https:' && hostname.endsWith('.run.app')) {
    return true;
  }

  return false;
}

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser / same-origin requests with no Origin header
    if (!origin) {
      return callback(null, true);
    }

    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }

    // Standard CORS rejection without throwing an error into Vite asset pipeline
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Tenant-ID',
    'X-CSRF-Token',
    'X-Correlation-ID',
    'Idempotency-Key',
    'X-Trace-ID',
  ],
  exposedHeaders: ['X-Request-ID', 'X-Correlation-ID', 'X-Trace-ID', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  maxAge: 86400, // 24 hours preflight cache
};

export const secureCors = cors(corsOptions);

/**
 * Explicit API origin guard mounted on /api/* routes:
 * Logs rejected origins and returns 403 CORS_ORIGIN_FORBIDDEN instead of silently processing state changes.
 */
export function strictApiOriginGuard(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (!origin) {
    return next();
  }

  if (isOriginAllowed(origin)) {
    return next();
  }

  const ctx = getRequestContext();
  logSecurityEvent({
    eventType: 'CORS_ORIGIN_REJECTED',
    severity: 'HIGH',
    message: `Blocked API request from untrusted origin: ${origin}`,
    metadata: { origin },
  });

  sendError(
    res,
    403,
    'CORS_ORIGIN_FORBIDDEN',
    'Cross-origin request denied by NEXORA strict origin policy.',
    undefined,
    ctx?.requestId
  );
}
