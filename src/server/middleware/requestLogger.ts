/**
 * NEXORA Multi-Tenant SaaS E-Commerce Platform
 * Centralized HTTP Request Logger Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.ts';
import { getRequestContext } from './requestContext.ts';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const statusCode = res.statusCode;
    const method = req.method;
    const url = req.originalUrl || req.url;
    const host = req.headers.host || '-';
    const ctx = getRequestContext();

    if (url.includes('/health')) {
      return;
    }

    logger.http(`${method} ${url} ${statusCode} - ${durationMs}ms`, {
      host,
      statusCode,
      durationMs,
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
    });
  });

  next();
}
