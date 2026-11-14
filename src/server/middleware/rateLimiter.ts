/**
 * NEXORA Security Foundation
 * Tiered Rate Limiting Middleware (express-rate-limit)
 */

import rateLimit, { RateLimitRequestHandler, Options } from 'express-rate-limit';
import { Request, Response } from 'express';
import { env } from '../../../packages/config/src/index.ts';
import { sendError } from '../utils/apiResponse.ts';
import { logSecurityEvent } from '../security/securityLogger.ts';
import { getRequestContext } from './requestContext.ts';

export function createRateLimiter(
  overrides: Partial<Options> & { limiterName?: string } = {}
): RateLimitRequestHandler {
  const { limiterName = 'api', ...rest } = overrides;

  return rateLimit({
    windowMs: rest.windowMs ?? env.RATE_LIMIT_WINDOW_MS,
    limit: rest.limit ?? env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req: Request) => {
      // Never lock out infrastructure health checks
      return req.originalUrl === '/api/health' || req.originalUrl === '/health';
    },
    handler: (req: Request, res: Response) => {
      const ctx = getRequestContext();
      logSecurityEvent({
        eventType: 'RATE_LIMIT_EXCEEDED',
        severity: 'MEDIUM',
        message: `Rate limit exceeded on [${limiterName}] for IP ${req.ip}`,
        metadata: { limiterName, method: req.method },
      });

      sendError(
        res,
        429,
        'RATE_LIMIT_EXCEEDED',
        'Too many requests. Please slow down and try again shortly.',
        undefined,
        ctx?.requestId
      );
    },
    ...rest,
  });
}

/**
 * Global API Limiter (default: 300 req / 15 min per IP)
 */
export const globalApiLimiter = createRateLimiter({
  limiterName: 'global-api',
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX_REQUESTS,
});

/**
 * Strict Authentication Brute-Force Limiter (default: 15 req / 15 min per IP)
 */
export const authRateLimiter = createRateLimiter({
  limiterName: 'auth-strict',
  windowMs: 15 * 60 * 1000,
  limit: env.AUTH_RATE_LIMIT_MAX,
});

/**
 * Sensitive Mutation / Admin Operations Limiter (30 req / minute)
 */
export const sensitiveActionLimiter = createRateLimiter({
  limiterName: 'sensitive-action',
  windowMs: 60 * 1000,
  limit: 30,
});
