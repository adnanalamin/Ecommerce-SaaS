/**
 * NEXORA Security Foundation
 * Request ID & Correlation ID Context Middleware (AsyncLocalStorage)
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';

export interface RequestContextData {
  requestId: string;
  correlationId: string;
  clientIp: string;
  method: string;
  path: string;
  userAgent: string;
  startedAt: number;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContextData>();

const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;

function extractSafeCorrelationId(req: Request): string {
  const candidate =
    (req.headers['x-correlation-id'] as string | undefined) ||
    (req.headers['x-trace-id'] as string | undefined);

  if (candidate && SAFE_ID_REGEX.test(candidate.trim())) {
    return candidate.trim();
  }
  return `cor_${randomUUID()}`;
}

export function getRequestContext(): RequestContextData | undefined {
  return requestContextStorage.getStore();
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = `req_${randomUUID()}`;
  const correlationId = extractSafeCorrelationId(req);
  const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';

  // Expose immutable tracing headers on response
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Correlation-ID', correlationId);
  res.setHeader('X-Trace-ID', requestId);

  const ctx: RequestContextData = {
    requestId,
    correlationId,
    clientIp,
    method: req.method,
    path: req.originalUrl || req.url,
    userAgent: (req.headers['user-agent'] || '').slice(0, 200),
    startedAt: Date.now(),
  };

  requestContextStorage.run(ctx, () => {
    next();
  });
}
