/**
 * NEXORA Security Foundation Routes
 * Exposes Security Posture Checklist, CSRF Token Issuer, Validation Probe, and Automated Test Runner.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../../utils/apiResponse.ts';
import { validateRequest } from '../../middleware/validateRequest.ts';
import { issueCsrfCookie, csrfProtectionMiddleware } from '../../middleware/csrf.ts';
import {
  getRecentSecurityEvents,
  inspectDependencyPosture,
  validateOutboundUrl,
} from '../../security/index.ts';
import { runSecurityVerificationSuite } from '../../security/testSecurity.ts';
import { env } from '../../../../packages/config/src/index.ts';

export const securityRouter = Router();

export const SECURITY_CONTROLS_CHECKLIST = [
  { id: 'SEC-CHK-01', control: 'Helmet & Secure HTTP Headers', status: 'ENFORCED', details: 'HSTS, X-Content-Type-Options: nosniff, Referrer-Policy, Permissions-Policy, API frame-ancestors none, X-Powered-By disabled.' },
  { id: 'SEC-CHK-02', control: 'Strict CORS Allowlist', status: 'ENFORCED', details: 'Zero wildcard or arbitrary origins even in dev; explicit host allowlist + API origin rejection guard.' },
  { id: 'SEC-CHK-03', control: 'Tiered Rate Limiting', status: 'ENFORCED', details: `Global perimeter (${env.RATE_LIMIT_MAX_REQUESTS} req/15m) + strict auth limiter (${env.AUTH_RATE_LIMIT_MAX} req/15m) with Draft-7 RateLimit headers.` },
  { id: 'SEC-CHK-04', control: 'Request Size & Depth Caps', status: 'ENFORCED', details: `JSON/URL body capped at ${env.MAX_REQUEST_BODY_SIZE}, parameterLimit=100, JSON max nesting depth=${env.MAX_JSON_DEPTH}.` },
  { id: 'SEC-CHK-05', control: 'Secure Cookie Configuration', status: 'ENFORCED', details: 'HttpOnly, SameSite=Lax/Strict, Signed cookies with __Host- prefix and Secure flag in production.' },
  { id: 'SEC-CHK-06', control: 'Zod Request Validation', status: 'ENFORCED', details: 'Strict schema validation middleware for params, query, and body returning structured 422 responses.' },
  { id: 'SEC-CHK-07', control: 'NoSQL Injection Prevention', status: 'ENFORCED', details: 'Recursive scanner rejects $-prefixed operators ($gt, $where, $ne), dotted paths, and __proto__.' },
  { id: 'SEC-CHK-08', control: 'XSS Prevention', status: 'ENFORCED', details: 'Active script/event-handler/data-URI detection on inputs + HTML entity encoding + production CSP.' },
  { id: 'SEC-CHK-09', control: 'CSRF Protection Strategy', status: 'ENFORCED', details: 'HMAC-signed double-submit cookie + Sec-Fetch-Site verification for cookie-authenticated mutations.' },
  { id: 'SEC-CHK-10', control: 'SSRF Protection', status: 'ENFORCED', details: 'DNS-resolved IP blocklist blocking RFC1918, loopback, IPv6 ::1/ULA, and cloud metadata 169.254.169.254.' },
  { id: 'SEC-CHK-11', control: 'Zero Stack-Trace Exposure', status: 'ENFORCED', details: 'Global error handler redacts messages and omits stack traces from all HTTP responses.' },
  { id: 'SEC-CHK-12', control: 'Centralized Security Logging & Redaction', status: 'ENFORCED', details: 'Recursive scrubber masks passwords, JWTs, Bearer tokens, CVVs, and DB URI credentials before logging.' },
  { id: 'SEC-CHK-13', control: 'Request ID & Correlation ID', status: 'ENFORCED', details: 'AsyncLocalStorage injects validated X-Request-ID and X-Correlation-ID on all logs and responses.' },
  { id: 'SEC-CHK-14', control: 'Argon2id Password Hashing', status: 'ENFORCED', details: 'OWASP-grade Argon2id (64 MiB, t=3, p=1) with 128-char DoS bound and strength validation.' },
  { id: 'SEC-CHK-15', control: 'Secret Management & AES-256-GCM', status: 'ENFORCED', details: 'Startup fails closed in production if dev secrets detected; sensitive fields encrypted with AES-256-GCM.' },
  { id: 'SEC-CHK-16', control: 'Safe File-Upload Validation', status: 'ENFORCED', details: 'Binary magic-byte verification, MIME/extension match, SVG/EXE blocklist, and path-traversal sanitization.' },
  { id: 'SEC-CHK-17', control: 'Dependency Vulnerability Audit', status: 'ENFORCED', details: 'CI lockfile & npm audit posture checks for known CVEs.' },
];

const ValidateProbeBodySchema = z
  .object({
    email: z.string().email(),
    url: z.string().url().optional(),
    note: z.string().max(200).optional(),
  })
  .strict();

/**
 * GET /api/v1/security/status
 */
securityRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const dependencyAudit = await inspectDependencyPosture();
    return sendSuccess(res, {
      environment: env.NODE_ENV,
      checklistCount: SECURITY_CONTROLS_CHECKLIST.length,
      checklist: SECURITY_CONTROLS_CHECKLIST,
      recentSecurityEvents: getRecentSecurityEvents(20),
      dependencyAudit,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unable to fetch security posture';
    return sendError(res, 500, 'SECURITY_STATUS_ERROR', msg);
  }
});

/**
 * GET /api/v1/security/csrf-token
 */
securityRouter.get('/csrf-token', (_req: Request, res: Response) => {
  const csrfToken = issueCsrfCookie(res);
  return sendSuccess(res, { csrfToken });
});

/**
 * POST /api/v1/security/validate-probe
 * Protected by strict Zod schema + global NoSQL/XSS/size middlewares + optional SSRF URL check
 */
securityRouter.post(
  '/validate-probe',
  validateRequest({ body: ValidateProbeBodySchema }),
  async (req: Request, res: Response) => {
    const { email, url, note } = req.body as z.infer<typeof ValidateProbeBodySchema>;
    if (url) {
      const ssrf = await validateOutboundUrl(url, { skipDnsResolution: true });
      if (!ssrf.allowed) {
        return sendError(res, 400, 'SSRF_URL_REJECTED', ssrf.reason || 'Outbound URL blocked by SSRF guard.');
      }
    }
    return sendSuccess(res, { validated: true, email, url: url ?? null, note: note ?? null });
  }
);

/**
 * POST /api/v1/security/csrf-probe
 * Strictly verifies signed double-submit CSRF cookie + header
 */
securityRouter.post(
  '/csrf-probe',
  csrfProtectionMiddleware({ enforceAlways: true }),
  (_req: Request, res: Response) => {
    return sendSuccess(res, { csrfVerified: true });
  }
);

/**
 * GET or POST /api/v1/security/verify
 * Executes the live automated security verification suite
 */
securityRouter.all('/verify', async (_req: Request, res: Response) => {
  try {
    const report = await runSecurityVerificationSuite();
    return sendSuccess(res, report);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Security verification execution failed';
    return sendError(res, 500, 'SECURITY_VERIFY_ERROR', msg);
  }
});
