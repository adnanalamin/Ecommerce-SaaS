/**
 * NEXORA Security Foundation
 * Helmet & Secure HTTP Headers Middleware
 */

import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { env } from '../../../packages/config/src/index.ts';

/**
 * Primary Helmet security headers applied globally.
 * - Enables HSTS, X-Content-Type-Options: nosniff, Referrer-Policy, X-DNS-Prefetch-Control,
 *   Cross-Origin-Opener-Policy, Cross-Origin-Resource-Policy, and disables X-Powered-By.
 * - In production, enforces strict Content-Security-Policy.
 * - Allows AI Studio / platform frame-ancestors on HTML SPA routes while locking /api/* to frame-ancestors 'none'.
 */
export const globalHelmetMiddleware = helmet({
  contentSecurityPolicy:
    env.NODE_ENV === 'production'
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'https:'],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'self'", 'https://aistudio.google.com', 'https://*.run.app'],
          },
        }
      : false,
  frameguard: false, // Handled granularly: DENY on /api/*, frame-ancestors controlled on SPA
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  dnsPrefetchControl: { allow: false },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  noSniff: true,
});

/**
 * Strict additional HTTP headers for API endpoints and Permissions-Policy.
 */
export function additionalSecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Restrict powerful browser hardware & tracking APIs
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
  );

  // For API routes: lock framing completely and prevent sensitive JSON caching
  if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/health')) {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; sandbox"
    );
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
  }

  next();
}
