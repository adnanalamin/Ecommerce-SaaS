/**
 * NEXORA Multi-Tenant SaaS E-Commerce Platform
 * Hardened Express Application Factory (Phase 05 Security Foundation)
 */

import express, { Express, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import { requestContextMiddleware } from './middleware/requestContext.ts';
import { globalHelmetMiddleware, additionalSecurityHeaders } from './middleware/securityHeaders.ts';
import { secureCors, strictApiOriginGuard } from './middleware/cors.ts';
import { createRateLimiter } from './middleware/rateLimiter.ts';
import { inputSecurityMiddleware } from './middleware/nosqlSanitizer.ts';
import { csrfProtectionMiddleware } from './middleware/csrf.ts';
import { requestLogger } from './middleware/requestLogger.ts';
import { tenantContextMiddleware } from './middleware/tenantContext.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { healthRouter } from './routes/health.ts';
import { v1Router } from './routes/v1/index.ts';
import { NotFoundError } from './utils/errors.ts';
import { env } from '../../packages/config/src/index.ts';

export interface CreateAppOptions {
  bodyLimit?: string;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
}

export function createExpressApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const bodyLimit = options.bodyLimit ?? env.MAX_REQUEST_BODY_SIZE;

  // 0. Server Fingerprinting & Proxy Hardening
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  // 1. Request ID & Correlation ID Context (Always First)
  app.use(requestContextMiddleware);

  // 2. Helmet & Strict HTTP Security Headers
  app.use(globalHelmetMiddleware);
  app.use(additionalSecurityHeaders);

  // 3. Cross-Origin Resource Sharing (Strict Allowlist)
  app.use(secureCors);

  // 4. Signed Cookie Parser
  app.use(cookieParser(env.COOKIE_SECRET));

  // 5. Tightly Bounded Body Parsing (DoS & Parameter Pollution Prevention)
  app.use(express.json({ limit: bodyLimit, strict: true }));
  app.use(express.urlencoded({ extended: false, limit: bodyLimit, parameterLimit: 100 }));

  // 6. Request Logging & Tenant Context
  app.use(requestLogger);
  app.use(tenantContextMiddleware);

  // 7. API Perimeter Security Controls
  const apiRateLimiter = createRateLimiter({
    limiterName: 'api-perimeter',
    windowMs: options.rateLimitWindowMs ?? env.RATE_LIMIT_WINDOW_MS,
    limit: options.rateLimitMax ?? env.RATE_LIMIT_MAX_REQUESTS,
  });

  app.use('/api', strictApiOriginGuard);
  app.use('/api', apiRateLimiter);
  app.use('/api', inputSecurityMiddleware({ rejectXss: true, maxDepth: env.MAX_JSON_DEPTH }));
  app.use('/api', csrfProtectionMiddleware());

  // 8. Direct Health Checks
  app.use('/api/health', healthRouter);
  app.use('/health', healthRouter);

  // 9. Versioned API Endpoints
  app.use('/api/v1', v1Router);

  // 10. API 404 Handler (Only for /api/* requests)
  app.use('/api/*', (req: Request, _res: Response, next) => {
    next(new NotFoundError(`API endpoint '${req.method} ${req.originalUrl}' does not exist.`));
  });

  // 11. Global Hardened Error Handler
  app.use(errorHandler);

  return app;
}
