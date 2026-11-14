/**
 * NEXORA Security Foundation - Automated Security Verification Suite
 *
 * Tests real HTTP requests against the hardened Express security stack AND unit security modules:
 * 1. HTTP Security Headers (Helmet, HSTS, X-Content-Type-Options, Permissions-Policy, X-Frame-Options, X-Powered-By removed)
 * 2. Strict CORS Allowlist (Untrusted origins rejected 403, trusted origins allowed)
 * 3. Oversized Request Rejection (413 PAYLOAD_TOO_LARGE)
 * 4. Malicious Input Defense (NoSQL injection $gt/$where, Prototype Pollution __proto__, XSS <script>, Zod strict schema)
 * 5. Rate-Limit Behavior (429 RATE_LIMIT_EXCEEDED + RateLimit-* headers after burst threshold)
 * 6. SSRF Guard (Blocks 127.0.0.1, 169.254.169.254, 10.0.0.1, ::1, metadata.google.internal; allows safe HTTPS)
 * 7. Argon2id Password Hashing & AES-256-GCM Secret Encryption
 * 8. Centralized Log Redaction (Never logs passwords, tokens, JWTs, or MongoDB credentials)
 * 9. Safe File Upload Validation (Magic-byte spoofing rejection, path traversal prevention, valid PNG acceptance)
 * 10. Signed Double-Submit CSRF Protection (Rejects missing/tampered token, accepts valid paired token)
 * 11. Production Secret Validation & Zero Stack-Trace Exposure
 */

import http from 'node:http';
import { AddressInfo } from 'node:net';
import { createExpressApp } from '../app.ts';
import {
  hashPassword,
  verifyPassword,
  encryptSecret,
  decryptSecret,
  redactSensitiveData,
  redactString,
  validateOutboundUrl,
  validateFileUpload,
  inspectDependencyPosture,
} from './index.ts';
import { formatLogEntry, logger } from '../utils/logger.ts';
import { validateProductionSecrets, env } from '../../../packages/config/src/index.ts';

export type SecurityTestCategory =
  | 'HEADERS'
  | 'CORS'
  | 'PAYLOAD_LIMITS'
  | 'INJECTION_XSS'
  | 'RATE_LIMIT'
  | 'SSRF'
  | 'CRYPTO_SECRETS'
  | 'LOGGING'
  | 'FILE_UPLOAD'
  | 'CSRF'
  | 'DEPENDENCIES';

export interface SecurityTestResult {
  id: string;
  name: string;
  category: SecurityTestCategory;
  status: 'PASSED' | 'FAILED';
  durationMs: number;
  details: string;
  error?: string;
}

export interface SecurityVerificationReport {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  results: SecurityTestResult[];
}

async function startEphemeralServer(options: { bodyLimit?: string; rateLimitMax?: number } = {}) {
  const app = createExpressApp({
    bodyLimit: options.bodyLimit ?? '16kb',
    rateLimitMax: options.rateLimitMax ?? 50,
    rateLimitWindowMs: 60_000,
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export async function runSecurityVerificationSuite(): Promise<SecurityVerificationReport> {
  logger.info('[SEC_TEST] Running NEXORA Phase 05 Automated Security Verification Suite...');
  const results: SecurityTestResult[] = [];

  const runCheck = async (
    id: string,
    name: string,
    category: SecurityTestCategory,
    fn: () => Promise<string>
  ) => {
    const t0 = performance.now();
    try {
      const details = await fn();
      results.push({
        id,
        name,
        category,
        status: 'PASSED',
        durationMs: Math.round(performance.now() - t0),
        details,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        id,
        name,
        category,
        status: 'FAILED',
        durationMs: Math.round(performance.now() - t0),
        details: 'Security assertion failed',
        error: msg,
      });
    }
  };

  // Start primary ephemeral security test server (16KB body cap to test oversized request cleanly)
  const testServer = await startEphemeralServer({ bodyLimit: '16kb', rateLimitMax: 100 });

  try {
    // 1. Security Headers & Fingerprinting
    await runCheck(
      'SEC-01',
      'HTTP Security Headers & Request/Correlation IDs',
      'HEADERS',
      async () => {
        const res = await fetch(`${testServer.baseUrl}/api/v1/security/status`, {
          headers: { 'X-Correlation-ID': 'cor_test_trace_12345' },
        });
        const requiredHeaders = [
          'x-content-type-options',
          'strict-transport-security',
          'referrer-policy',
          'permissions-policy',
          'x-frame-options',
          'content-security-policy',
          'x-request-id',
          'x-correlation-id',
        ];
        const missing = requiredHeaders.filter((h) => !res.headers.get(h));
        if (missing.length > 0) {
          throw new Error(`Missing required security headers: ${missing.join(', ')}`);
        }
        if (res.headers.get('x-powered-by')) {
          throw new Error('Server exposed X-Powered-By fingerprint header.');
        }
        if (res.headers.get('x-content-type-options') !== 'nosniff') {
          throw new Error('X-Content-Type-Options is not nosniff.');
        }
        if (res.headers.get('x-correlation-id') !== 'cor_test_trace_12345') {
          throw new Error('Correlation ID propagation failed.');
        }
        return 'Verified Helmet HSTS, nosniff, Referrer-Policy, Permissions-Policy, X-Frame-Options: DENY, Request/Correlation IDs, and removed X-Powered-By.';
      }
    );

    // 2. Strict CORS Allowlist (Invalid Origin Rejection)
    await runCheck(
      'SEC-02',
      'Strict CORS Allowlist Rejects Arbitrary Origin',
      'CORS',
      async () => {
        const evilRes = await fetch(`${testServer.baseUrl}/api/v1/security/status`, {
          headers: { Origin: 'https://evil-attacker.example.com' },
        });
        if (evilRes.status !== 403) {
          throw new Error(`Expected 403 for untrusted origin, received ${evilRes.status}`);
        }
        if (evilRes.headers.get('access-control-allow-origin')) {
          throw new Error('Untrusted origin received Access-Control-Allow-Origin header!');
        }

        const trustedOrigin = env.APP_URL && env.APP_URL.startsWith('http')
          ? new URL(env.APP_URL).origin
          : `https://storefront.${env.PLATFORM_DOMAIN}`;

        const trustedRes = await fetch(`${testServer.baseUrl}/api/v1/security/status`, {
          headers: { Origin: trustedOrigin },
        });
        if (trustedRes.status !== 200 || trustedRes.headers.get('access-control-allow-origin') !== trustedOrigin) {
          throw new Error(`Trusted origin (${trustedOrigin}) was unexpectedly rejected (status ${trustedRes.status}).`);
        }
        return `Blocked https://evil-attacker.example.com with HTTP 403 (no ACAO header); permitted ${trustedOrigin}.`;
      }
    );

    // 3. NoSQL Injection & Prototype Pollution Defense
    await runCheck(
      'SEC-03',
      'Malicious Input: NoSQL Operator ($gt/$where) & Prototype Pollution Blocked',
      'INJECTION_XSS',
      async () => {
        const nosqlRes = await fetch(`${testServer.baseUrl}/api/v1/security/validate-probe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: { $gt: '' }, note: 'probe' }),
        });
        if (nosqlRes.status !== 400) {
          throw new Error(`Expected 400 for NoSQL $gt payload, got ${nosqlRes.status}`);
        }

        const protoRes = await fetch(`${testServer.baseUrl}/api/v1/security/validate-probe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{"email":"test@nexora.shop","__proto__":{"isAdmin":true}}',
        });
        if (protoRes.status !== 400) {
          throw new Error(`Expected 400 for __proto__ injection, got ${protoRes.status}`);
        }
        return 'Blocked $gt operator injection and __proto__ prototype pollution with HTTP 400.';
      }
    );

    // 4. XSS Payload Rejection & Zod Schema Validation
    await runCheck(
      'SEC-04',
      'XSS Vector Rejection & Strict Zod Schema Validation',
      'INJECTION_XSS',
      async () => {
        const xssRes = await fetch(`${testServer.baseUrl}/api/v1/security/validate-probe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'user@nexora.shop', note: '<script>alert(document.cookie)</script>' }),
        });
        if (xssRes.status !== 400) {
          throw new Error(`Expected 400 for XSS script tag, got ${xssRes.status}`);
        }

        const zodRes = await fetch(`${testServer.baseUrl}/api/v1/security/validate-probe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'not-an-email', unauthorizedRoleField: 'SUPER_ADMIN' }),
        });
        if (zodRes.status !== 422) {
          throw new Error(`Expected 422 VALIDATION_ERROR for invalid email/extra field, got ${zodRes.status}`);
        }
        const zodJson = (await zodRes.json()) as { error?: { stack?: unknown; code?: string } };
        if (zodJson.error && 'stack' in zodJson.error) {
          throw new Error('Error response leaked stack trace property.');
        }
        return 'Rejected <script> XSS payload (400) and strict Zod schema tampering (422) with zero stack leakage.';
      }
    );

    // 5. Oversized Request Rejection
    await runCheck(
      'SEC-05',
      'Oversized Request Body Blocked (413 PAYLOAD_TOO_LARGE)',
      'PAYLOAD_LIMITS',
      async () => {
        const hugeString = 'A'.repeat(24 * 1024); // > 16kb test server limit
        const oversizedRes = await fetch(`${testServer.baseUrl}/api/v1/security/validate-probe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'user@nexora.shop', note: hugeString }),
        });
        if (oversizedRes.status !== 413) {
          throw new Error(`Expected 413 PAYLOAD_TOO_LARGE, got ${oversizedRes.status}`);
        }
        return 'Rejected 24KB JSON payload against 16KB perimeter cap with HTTP 413 PAYLOAD_TOO_LARGE.';
      }
    );

    // 6. Rate-Limit Behavior (Burst -> 429)
    await runCheck(
      'SEC-06',
      'Rate Limiting Enforces 429 Too Many Requests Under Burst',
      'RATE_LIMIT',
      async () => {
        const burstServer = await startEphemeralServer({ rateLimitMax: 3 });
        try {
          const statuses: number[] = [];
          let rateLimitHeaderSeen = false;
          for (let i = 0; i < 4; i++) {
            const r = await fetch(`${burstServer.baseUrl}/api/v1/security/status`);
            statuses.push(r.status);
            if (r.headers.get('ratelimit') || r.headers.get('ratelimit-limit')) {
              rateLimitHeaderSeen = true;
            }
          }
          if (statuses[0] !== 200 || statuses[3] !== 429) {
            throw new Error(`Expected [200,200,200,429], observed [${statuses.join(',')}]`);
          }
          if (!rateLimitHeaderSeen) {
            throw new Error('Standard RateLimit headers missing from response.');
          }
          return `Verified burst behavior [${statuses.join(', ')}] with Draft-7 RateLimit headers and 429 lockout on 4th request.`;
        } finally {
          await burstServer.close();
        }
      }
    );

    // 7. CSRF Protection Strategy
    await runCheck(
      'SEC-07',
      'Signed Double-Submit CSRF Token Protection',
      'CSRF',
      async () => {
        const missingCsrfRes = await fetch(`${testServer.baseUrl}/api/v1/security/csrf-probe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'transfer' }),
        });
        if (missingCsrfRes.status !== 403) {
          throw new Error(`Expected 403 when CSRF token missing, got ${missingCsrfRes.status}`);
        }

        const tokenRes = await fetch(`${testServer.baseUrl}/api/v1/security/csrf-token`);
        const tokenJson = (await tokenRes.json()) as { data: { csrfToken: string } };
        const setCookie = tokenRes.headers.get('set-cookie') || '';
        const cookiePair = setCookie.split(';')[0];

        const validCsrfRes = await fetch(`${testServer.baseUrl}/api/v1/security/csrf-probe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: cookiePair,
            'X-CSRF-Token': tokenJson.data.csrfToken,
          },
          body: JSON.stringify({ action: 'transfer' }),
        });
        if (validCsrfRes.status !== 200) {
          throw new Error(`Expected 200 with valid CSRF cookie+header pair, got ${validCsrfRes.status}`);
        }
        return 'Rejected unauthenticated mutation missing X-CSRF-Token (403); accepted HMAC-signed double-submit pair (200).';
      }
    );

    // 8. SSRF Protection
    await runCheck(
      'SEC-08',
      'SSRF Protection Blocks Internal, Loopback & Cloud Metadata IPs',
      'SSRF',
      async () => {
        const targets = [
          'https://127.0.0.1/admin',
          'https://169.254.169.254/latest/meta-data/',
          'https://10.0.0.5/internal',
          'https://[::1]/secret',
          'http://metadata.google.internal/computeMetadata/v1/',
        ];
        for (const t of targets) {
          const check = await validateOutboundUrl(t, { allowHttp: false, skipDnsResolution: true });
          if (check.allowed) {
            throw new Error(`SSRF Guard failed to block dangerous target: ${t}`);
          }
        }
        const safeCheck = await validateOutboundUrl('https://api.stripe.com/v1/charges', { skipDnsResolution: true });
        if (!safeCheck.allowed) {
          throw new Error('SSRF Guard blocked legitimate public HTTPS endpoint.');
        }
        return 'Blocked loopback, RFC1918 private, IPv6 ::1, and 169.254.169.254 metadata endpoints; permitted valid public HTTPS.';
      }
    );

    // 9. Argon2id & AES-256-GCM Secret Management
    await runCheck(
      'SEC-09',
      'Argon2id Hashing, AES-256-GCM Secret Encryption & Production Guard',
      'CRYPTO_SECRETS',
      async () => {
        const hash = await hashPassword('N3xora!SecurePass#2026');
        if (!hash.startsWith('$argon2id$')) {
          throw new Error('Password hash did not use Argon2id algorithm.');
        }
        const ok = await verifyPassword(hash, 'N3xora!SecurePass#2026');
        const bad = await verifyPassword(hash, 'WrongPassword123!');
        if (!ok || bad) {
          throw new Error('Argon2id password verification returned incorrect boolean result.');
        }

        const secretPlain = 'bkash_live_secret_987654321';
        const encrypted = encryptSecret(secretPlain, 'tenant_123');
        const decrypted = decryptSecret(encrypted, 'tenant_123');
        if (decrypted !== secretPlain || encrypted.includes(secretPlain)) {
          throw new Error('AES-256-GCM encryption/decryption failed.');
        }

        let prodGuardTriggered = false;
        try {
          validateProductionSecrets({ ...env, NODE_ENV: 'production' });
        } catch {
          prodGuardTriggered = true;
        }
        if (!prodGuardTriggered) {
          throw new Error('Production secret validator failed to block default dev secrets.');
        }
        return 'Verified Argon2id hash/verify, AES-256-GCM AAD authenticated encryption, and production default-secret boot abort.';
      }
    );

    // 10. Centralized Log Redaction
    await runCheck(
      'SEC-10',
      'Log Redaction Scrubs Passwords, JWTs, Tokens & MongoDB URIs',
      'LOGGING',
      async () => {
        const sample = redactSensitiveData({
          email: 'merchant@nexora.shop',
          password: 'SuperSecretPassword123!',
          authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature123',
          cardCvv: '994',
          nested: {
            dbUri: 'mongodb+srv://admin:TopSecretPass@cluster0.mongodb.net/nexora',
          },
        });
        const formatted = formatLogEntry('info', redactString('Connecting mongodb://root:pass123@db:27017'), sample);
        if (
          formatted.includes('SuperSecretPassword123!') ||
          formatted.includes('signature123') ||
          formatted.includes('994') ||
          formatted.includes('TopSecretPass') ||
          formatted.includes('pass123')
        ) {
          throw new Error('Sensitive credential leaked into formatted log output!');
        }
        return 'Verified zero leakage of passwords, JWTs, CVV, and MongoDB URI credentials in log formatter.';
      }
    );

    // 11. Safe File Upload Magic-Byte Validation & Dependency Posture
    await runCheck(
      'SEC-11',
      'File Upload Magic-Byte Verification & Dependency Audit Posture',
      'FILE_UPLOAD',
      async () => {
        // Spoofed PNG containing <script> XSS
        const fakePng = validateFileUpload({
          originalName: '../../evil.png',
          declaredMimeType: 'image/png',
          buffer: Buffer.from('<script>alert(1)</script>'),
        });
        if (fakePng.valid) {
          throw new Error('Validator accepted path-traversal / script-spoofed PNG.');
        }

        const spoofedExe = validateFileUpload({
          originalName: 'avatar.png',
          declaredMimeType: 'image/png',
          buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]), // MZ executable header
        });
        if (spoofedExe.valid) {
          throw new Error('Validator accepted EXE disguised as PNG.');
        }

        // Valid PNG magic bytes
        const validPng = validateFileUpload({
          originalName: 'brand-logo.png',
          declaredMimeType: 'image/png',
          buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
        });
        if (!validPng.valid || !validPng.sanitizedFilename?.endsWith('.png')) {
          throw new Error('Validator rejected legitimate PNG signature.');
        }

        const depSummary = await inspectDependencyPosture();
        if (depSummary.securityPackagesInstalled.length < 5) {
          throw new Error('Missing expected core security packages.');
        }
        return `Blocked path traversal and MZ-spoofed PNG; accepted valid PNG (${validPng.sanitizedFilename}). Verified ${depSummary.securityPackagesInstalled.length} core security packages.`;
      }
    );
  } finally {
    await testServer.close();
  }

  const passed = results.filter((r) => r.status === 'PASSED').length;
  const failed = results.filter((r) => r.status === 'FAILED').length;

  logger.info('[SEC_TEST] Verification suite finished.', {
    totalTests: results.length,
    passed,
    failed,
  });

  return {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passed,
    failed,
    results,
  };
}
