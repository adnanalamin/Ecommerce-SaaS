/**
 * NEXORA Multi-Tenant SaaS E-Commerce Platform
 * Global Hardened Error Handling Middleware
 *
 * Enforces Mandatory Rules:
 * - Never expose stack traces in production (nor in any HTTP response).
 * - Never leak secrets, database URIs, or internal paths in error responses.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.ts';
import { sendError } from '../utils/apiResponse.ts';
import { logger } from '../utils/logger.ts';
import { env } from '../../../packages/config/src/index.ts';
import { getRequestContext } from './requestContext.ts';
import { logSecurityEvent } from '../security/securityLogger.ts';
import { redactString } from '../security/redaction.ts';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const ctx = getRequestContext();
  const traceId = ctx?.requestId || (res.getHeader('X-Request-ID') as string);

  // 1. Express Body-Parser Oversized Payload (413)
  if (
    typeof err === 'object' &&
    err !== null &&
    ('type' in err || 'status' in err)
  ) {
    const bodyErr = err as { type?: string; status?: number; statusCode?: number; message?: string };
    if (bodyErr.type === 'entity.too.large' || bodyErr.status === 413 || bodyErr.statusCode === 413) {
      logSecurityEvent({
        eventType: 'PAYLOAD_TOO_LARGE',
        severity: 'MEDIUM',
        message: `Rejected oversized request payload on ${req.method} ${req.originalUrl}`,
      });
      sendError(
        res,
        413,
        'PAYLOAD_TOO_LARGE',
        `Request payload exceeds maximum allowed size (${env.MAX_REQUEST_BODY_SIZE}).`,
        undefined,
        traceId
      );
      return;
    }

    // 2. Malformed JSON Syntax Error (400)
    if (err instanceof SyntaxError && (bodyErr.type === 'entity.parse.failed' || bodyErr.status === 400)) {
      sendError(
        res,
        400,
        'INVALID_JSON_PAYLOAD',
        'Malformed JSON request body.',
        undefined,
        traceId
      );
      return;
    }
  }

  // 3. Zod Validation Errors (422)
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.') || 'body',
      message: issue.message,
      code: issue.code,
    }));
    logger.warn(`[Validation Error] on ${req.method} ${req.originalUrl}`, { detailsCount: details.length });
    sendError(
      res,
      422,
      'VALIDATION_ERROR',
      'Input validation failed. Please review the highlighted fields.',
      details,
      traceId
    );
    return;
  }

  // 4. Custom Application Operational Errors
  if (err instanceof AppError) {
    const safeMsg = redactString(err.message);
    if (err.statusCode >= 500) {
      logger.error(`[AppError ${err.code}] ${safeMsg}`, { traceId });
    } else {
      logger.warn(`[AppError ${err.code}] ${safeMsg}`, { traceId });
    }
    sendError(res, err.statusCode, err.code, safeMsg, err.details, traceId);
    return;
  }

  // 5. Mongoose / MongoDB Specific Errors
  if (typeof err === 'object' && err !== null && 'name' in err) {
    const namedErr = err as { name: string; code?: number; message?: string };

    if (namedErr.name === 'MongoServerError' && namedErr.code === 11000) {
      logger.warn('[Mongo Duplicate Key]', { traceId });
      sendError(res, 409, 'DUPLICATE_KEY_ERROR', 'A resource with this identifier already exists.', undefined, traceId);
      return;
    }

    if (namedErr.name === 'CastError') {
      sendError(res, 400, 'INVALID_IDENTIFIER', 'Malformed resource identifier format.', undefined, traceId);
      return;
    }
  }

  // 6. Unhandled / Unexpected Errors — NEVER expose stack trace or internal error strings in production
  const unexpected = err instanceof Error ? err : new Error(String(err));
  const safeErrorMessage = redactString(unexpected.message);

  logger.error(`[CRITICAL UNHANDLED ERROR] ${safeErrorMessage}`, {
    traceId,
    url: req.originalUrl,
    method: req.method,
    ...(env.NODE_ENV !== 'production' ? { stack: redactString(unexpected.stack || '') } : {}),
  });

  const publicMessage =
    env.NODE_ENV === 'production'
      ? 'An internal server error occurred. Reference the traceId when contacting support.'
      : safeErrorMessage;

  sendError(res, 500, 'INTERNAL_SERVER_ERROR', publicMessage, undefined, traceId);
}
