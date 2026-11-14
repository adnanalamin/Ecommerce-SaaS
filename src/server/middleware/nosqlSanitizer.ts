/**
 * NEXORA Security Foundation
 * NoSQL Injection, Prototype Pollution & XSS Payload Defense Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { env } from '../../../packages/config/src/index.ts';
import { scanForNoSqlInjection } from '../security/sanitize.ts';
import { scanPayloadForXss } from '../security/xss.ts';
import { logSecurityEvent } from '../security/securityLogger.ts';
import { sendError } from '../utils/apiResponse.ts';
import { getRequestContext } from './requestContext.ts';

export interface InputSecurityOptions {
  rejectXss?: boolean;
  maxDepth?: number;
}

/**
 * Middleware that inspects req.body, req.query, and req.params before controllers execute:
 * 1. Rejects MongoDB operator injection ($where, $ne, $gt, etc.), dotted paths, and __proto__.
 * 2. Enforces maximum JSON nesting depth to prevent parser/CPU exhaustion.
 * 3. Optionally rejects blatant XSS vectors (<script>, javascript:, inline handlers) on API routes.
 */
export function inputSecurityMiddleware(
  options: InputSecurityOptions = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const maxDepth = options.maxDepth ?? env.MAX_JSON_DEPTH;
  const rejectXss = options.rejectXss ?? true;

  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = getRequestContext();
    const targets: Array<{ location: string; data: unknown }> = [
      { location: 'body', data: req.body },
      { location: 'query', data: req.query },
      { location: 'params', data: req.params },
    ];

    // 1. NoSQL Injection & Prototype Pollution Check
    for (const target of targets) {
      const scan = scanForNoSqlInjection(target.data, maxDepth);
      if (!scan.safe) {
        logSecurityEvent({
          eventType: 'NOSQL_INJECTION_BLOCKED',
          severity: 'HIGH',
          message: `Blocked malicious input in request ${target.location}: ${scan.violations[0]}`,
          metadata: {
            location: target.location,
            violationsCount: scan.violations.length,
            firstViolation: scan.violations[0],
          },
        });

        sendError(
          res,
          400,
          scan.maxDepthExceeded ? 'PAYLOAD_DEPTH_EXCEEDED' : 'MALICIOUS_INPUT_DETECTED',
          scan.maxDepthExceeded
            ? 'Request payload exceeds maximum structural nesting depth.'
            : 'Potentially unsafe operator or key detected in request input.',
          undefined,
          ctx?.requestId
        );
        return;
      }
    }

    // 2. XSS Payload Check
    if (rejectXss) {
      for (const target of targets) {
        const xssScan = scanPayloadForXss(target.data, target.location);
        if (!xssScan.safe) {
          logSecurityEvent({
            eventType: 'XSS_PAYLOAD_DETECTED',
            severity: 'HIGH',
            message: `Blocked XSS payload in request ${target.location}`,
            metadata: {
              location: target.location,
              findingsCount: xssScan.findings.length,
              firstFinding: xssScan.findings[0],
            },
          });

          sendError(
            res,
            400,
            'XSS_PAYLOAD_REJECTED',
            'Potentially dangerous HTML or script content is not permitted.',
            undefined,
            ctx?.requestId
          );
          return;
        }
      }
    }

    next();
  };
}
