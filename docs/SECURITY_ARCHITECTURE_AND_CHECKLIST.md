# NEXORA Security Foundation & Hardening Specification
**Document ID:** NEXORA-ARCH-SEC-005  
**Version:** 1.0.0  
**Classification:** Principal Application Security Architecture  
**Standards Alignment:** OWASP ASVS Level 2, OWASP Top 10 (2021/2025), NIST SP 800-63B / 800-38D

---

## 1. Security Defense-in-Depth Pipeline

Every HTTP request entering NEXORA traverses an ordered, fail-closed security middleware stack before reaching any business controller:

1. **Server Fingerprinting & Proxy Hardening** (`src/server/app.ts`)
   - `app.disable('x-powered-by')` removes framework leakage.
   - `app.set('trust proxy', env.TRUST_PROXY_HOPS)` ensures `req.ip` resolves accurately behind Nginx / Cloud Run load balancers for rate limiting and audit trails.
2. **Request ID & Correlation ID Context** (`src/server/middleware/requestContext.ts`)
   - Assigns an immutable `X-Request-ID` (`req_<uuid>`) per request and propagates or generates a regex-validated `X-Correlation-ID` (`^[a-zA-Z0-9_-]{8,64}$`) via `AsyncLocalStorage`, preventing log-forging/CRLF header injection.
3. **Helmet & Strict HTTP Security Headers** (`src/server/middleware/securityHeaders.ts`)
   - Enforces `Strict-Transport-Security` (1 year, `includeSubDomains`, `preload`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-DNS-Prefetch-Control: off`, `X-Permitted-Cross-Domain-Policies: none`, `Permissions-Policy`, and production `Content-Security-Policy`.
   - API endpoints (`/api/*`, `/health`) additionally enforce `X-Frame-Options: DENY`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; sandbox`, and `Cache-Control: no-store`.
4. **Strict CORS Allowlist** (`src/server/middleware/cors.ts`)
   - Zero wildcard (`*`) or arbitrary origin bypasses, even in development.
   - Only explicitly allowlisted origins (`CORS_ALLOWED_ORIGINS`, `APP_URL`, `localhost`/`127.0.0.1`, `*.PLATFORM_DOMAIN`, and verified HTTPS `*.run.app` preview hosts) are accepted.
   - `strictApiOriginGuard` intercepts untrusted `Origin` headers on `/api/*`, logs a `HIGH` severity `CORS_ORIGIN_REJECTED` event, and terminates with HTTP `403 CORS_ORIGIN_FORBIDDEN`.
5. **Request Size & Structural Depth Caps** (`src/server/app.ts`, `src/server/middleware/nosqlSanitizer.ts`)
   - Body parsers strictly bounded to `MAX_REQUEST_BODY_SIZE` (`1mb` default), `extended: false`, `parameterLimit: 100`.
   - Oversized payloads terminate cleanly with `413 PAYLOAD_TOO_LARGE`.
   - Recursive nesting scanner rejects JSON payloads exceeding `MAX_JSON_DEPTH` (20 levels) to mitigate parser exhaustion DoS.
6. **Tiered Rate Limiting** (`src/server/middleware/rateLimiter.ts`)
   - Draft-7 standard `RateLimit-*` headers (`globalApiLimiter`: 300 req / 15m, `authRateLimiter`: 15 req / 15m, `sensitiveActionLimiter`: 30 req / 1m).
   - Emits `RATE_LIMIT_EXCEEDED` security events and `429 RATE_LIMIT_EXCEEDED`.
7. **NoSQL Injection, Prototype Pollution & XSS Defense** (`src/server/middleware/nosqlSanitizer.ts`, `src/server/security/sanitize.ts`, `src/server/security/xss.ts`)
   - Rejects `$`-prefixed MongoDB operators (`$where`, `$gt`, `$ne`, `$expr`, etc.), dotted path injection keys, and prototype-pollution keys (`__proto__`, `constructor`, `prototype`) across `body`, `query`, and `params`.
   - Rejects active XSS vectors (`<script>`, `javascript:`, `vbscript:`, `data:text/html`, inline `on*=`) and provides `escapeHtml`, `stripXssVectors`, and `escapeRegex`.
8. **Zod Request Validation** (`src/server/middleware/validateRequest.ts`)
   - Reusable `validateRequest({ body, query, params })` validates and strips untrusted fields before controllers execute, returning standardized `422 VALIDATION_ERROR`.
9. **CSRF Protection Strategy** (`src/server/middleware/csrf.ts`)
   - HMAC-SHA256 signed double-submit cookie (`nexora_csrf` + `X-CSRF-Token`) + `Sec-Fetch-Site: cross-site` defense for cookie-authenticated mutations.
   - Stateless `Authorization: Bearer` API clients without session cookies and HMAC-signed payment webhooks remain cleanly supported.
10. **SSRF Protection for Server-Side URL Fetching** (`src/server/security/ssrfGuard.ts`)
    - `validateOutboundUrl` and `safeServerFetch` enforce HTTPS, disallow URL credentials (`user:pass@`), resolve DNS, block loopback (`127.0.0.0/8`, `::1`), RFC1918 private subnets, link-local / cloud metadata (`169.254.169.254`, `metadata.google.internal`), IPv4-mapped IPv6, and disable HTTP redirects (`redirect: 'error'`).
11. **Argon2id Password Hashing & AES-256-GCM Secret Management** (`src/server/security/password.ts`, `src/server/security/secrets.ts`, `packages/config/src/env.ts`)
    - Passwords hashed with `argon2id` (`memoryCost: 65536`, `timeCost: 3`, `parallelism: 1`) with 8–128 char bounds and strength scoring.
    - Sensitive tenant credentials (gateway keys, MFA secrets, enterprise DB URIs) encrypted at rest using AES-256-GCM with AAD binding.
    - Production boot fails closed if default development secrets are detected.
12. **Centralized Security Logging & Automatic Log Redaction** (`src/server/security/redaction.ts`, `src/server/security/securityLogger.ts`, `src/server/utils/logger.ts`)
    - Every log line and metadata object passes through `redactSensitiveData` & `redactString`, scrubbing `password`, `token`, `secret`, `authorization`, `cookie`, `cvv`, JWTs (`eyJ...`), and MongoDB URI credentials (`mongodb://user:pass@...`).
13. **Safe File Upload Validation** (`src/server/security/fileUpload.ts`)
    - Validates binary magic bytes (`JPEG`, `PNG`, `WEBP`, `PDF`), enforces MIME-to-extension matching, blocks `.svg`/`.html`/`.exe`/`.php`, prevents path-traversal (`..`, `\0`), and assigns random UUID filenames.
14. **Hardened Error Responses** (`src/server/middleware/errorHandler.ts`)
    - Stack traces are NEVER returned in HTTP JSON responses and internal messages are withheld in `NODE_ENV=production`.

---

## 2. Security Verification Checklist

| ID | Control Area | Enforcement Module | Automated Test Coverage |
|---|---|---|---|
| SEC-01 | Helmet & Secure HTTP Headers | `securityHeaders.ts` | `SEC-01` (Live HTTP headers + X-Powered-By removal) |
| SEC-02 | Strict CORS Allowlist | `cors.ts` | `SEC-02` (403 on evil origin, 200 on allowlist) |
| SEC-03 | NoSQL Injection & Prototype Pollution | `nosqlSanitizer.ts`, `sanitize.ts` | `SEC-03` (`$gt` & `__proto__` blocked 400) |
| SEC-04 | XSS Prevention & Strict Zod Validation | `xss.ts`, `validateRequest.ts` | `SEC-04` (`<script>` 400 + Zod strict 422) |
| SEC-05 | Request Size & Depth Limits | `app.ts`, `errorHandler.ts` | `SEC-05` (Oversized 24KB > 16KB -> 413) |
| SEC-06 | Rate Limiting | `rateLimiter.ts` | `SEC-06` (Burst -> 429 + RateLimit headers) |
| SEC-07 | CSRF Protection Strategy | `csrf.ts` | `SEC-07` (Missing token 403, valid pair 200) |
| SEC-08 | SSRF Guard | `ssrfGuard.ts` | `SEC-08` (Loopback/Private/Metadata blocked) |
| SEC-09 | Argon2id, Secret Encryption & Prod Guard | `password.ts`, `secrets.ts`, `env.ts` | `SEC-09` (Hash/verify + AES-GCM + prod abort) |
| SEC-10 | Centralized Log Redaction & Correlation ID | `redaction.ts`, `logger.ts`, `requestContext.ts` | `SEC-10` (Passwords/JWT/URIs scrubbed) |
| SEC-11 | Safe File Upload & Dependency Audit | `fileUpload.ts`, `dependencyAudit.ts` | `SEC-11` (Magic-byte spoofing & traversal blocked) |

---

## 3. Running Automated Security Tests & Dependency Audits

```bash
# Run full automated security suite (live HTTP + cryptographic + sanitizer tests)
npm run security:test

# Generate lockfile & run npm vulnerability audit
npm run security:lock
npm run security:audit

# Trigger via REST API
curl -X POST http://localhost:3000/api/v1/security/verify
```

---

## 4. Remaining Security Limitations & Roadmap Controls

To ensure full transparency during Phase 05 sign-off, the following infrastructure-level limitations remain outside the single-node Express application layer and must be provisioned in Phase 17 (DevOps & Production Deployment):

1. **In-Memory Rate Limiter Store**:
   - *Current State*: `express-rate-limit` currently uses an in-memory store per Node.js worker process.
   - *Limitation*: In a multi-replica horizontal Kubernetes/Cloud Run deployment, rate limits are enforced per-pod rather than globally across the fleet.
   - *Remediation*: Attach `rate-limit-redis` backed by the Phase 01 Redis cluster before scaling beyond 1 instance.
2. **File Upload Malware Scanning (AV/CDR)**:
   - *Current State*: Uploads undergo strict size limits, extension/MIME checks, path sanitization, and binary magic-byte inspection.
   - *Limitation*: Polyglot payloads or zero-day PDF exploits cannot be detected purely via leading magic bytes.
   - *Remediation*: Route uploaded files through a quarantine bucket with asynchronous ClamAV / cloud malware scanning before publishing to the public CDN.
3. **DNS Rebinding Window Between Validation & Fetch (TOCTOU)**:
   - *Current State*: `validateOutboundUrl` resolves DNS records and rejects private/metadata IPs immediately before `fetch()`.
   - *Limitation*: Node's standard `fetch()` performs its own DNS lookup, leaving a theoretical sub-millisecond DNS-rebinding TOCTOU window.
   - *Remediation*: Pin the validated IP on a custom `http.Agent`/`undici` dispatcher `lookup` hook in production webhook workers, and enforce outbound VPC egress firewall rules blocking RFC1918/169.254.169.254 at the network layer.
4. **Edge Layer WAF & Volumetric DDoS Mitigation**:
   - *Current State*: Application-layer rate limiting and body caps protect Node.js event loop resources.
   - *Limitation*: Volumetric Layer 3/4/7 DDoS floods can saturate socket connections prior to Express execution.
   - *Remediation*: Terminate TLS behind Cloudflare WAF / Cloud Armor + Nginx ingress rate limits.
5. **Secret Rotation & KMS Integration**:
   - *Current State*: Secrets are validated at boot and field-level secrets use AES-256-GCM with `ENCRYPTION_MASTER_KEY`.
   - *Limitation*: Key rotation currently requires manual re-encryption or dual-key decryption logic.
   - *Remediation*: Integrate GCP Secret Manager / AWS KMS with versioned key identifiers (`v1:`, `v2:`) for zero-downtime key rotation.
