# Risk Register & System Acceptance Criteria
## Document Version: 1.0.0 — Phase 01 Master Architecture
**Platform**: NEXORA Multi-Tenant SaaS E-Commerce Store Builder  
**Author**: Principal Risk Officer & Lead Quality Assurance Architect  
**Status**: APPROVED

---

## 1. Technical Risk Register & Mitigation Matrix

| Risk ID | Risk Description | Likelihood | Impact | Severity Score | Architectural Mitigation Strategy | Contingency / Fallback Plan |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| **RSK-01** | **Cross-Tenant Data Leakage**: An engineer writes a custom Mongoose query omitting `tenantId`, returning records from other merchants. | Low | Critical | **HIGH** | Global Mongoose query interceptor plugin that programmatically injects `{ tenantId: ctx.tenantId }` into all find/update/delete operations before execution. Automated AST linter rules that fail CI if raw unscoped queries are detected. | Immediate tenant session termination, security audit logging, and point-in-time forensic data review. |
| **RSK-02** | **Flash Sale Inventory Overdraft**: Two shoppers simultaneously purchase the final unit of a scarce product, leading to overselling. | Med | High | **HIGH** | Redis distributed mutex locks (`Redlock`) applied to `{tenantId}:{variantId}` during checkout commit, combined with MongoDB atomic `$inc: { stockQuantity: -quantity }` asserting `stockQuantity >= quantity`. | Automated order cancellation, refund processing, and customer notification with apologetic voucher credit. |
| **RSK-03** | **Webhook Replay / Double Spend**: Attacker intercepts or replays a successful bKash/SSLCommerz payment webhook payload to mark unpaid orders as settled. | Low | Critical | **HIGH** | HMAC signature verification against raw binary request body + unique compound database index on `{ gateway: 1, gatewayTransactionId: 1 }` + Redis idempotency lock. | Idempotent duplicate drop; immediate security alert dispatch to Platform Operations. |
| **RSK-04** | **Payment Gateway Eligibility & Compliance**: Merchant attempts to configure Stripe/PayPal without a foreign legal entity, leading to customer checkout failure. | High | Med | **MEDIUM** | Frontend and backend onboarding checks that enforce regional gateway restrictions. Ineligible gateways remain locked in the UI with educational tooltips. | Seamless fallback to domestic Bangladesh gateways (bKash, Nagad, SSLCommerz) or Bank Transfer. |
| **RSK-05** | **Custom Domain DNS Configuration Failure**: Merchant points domain to incorrect IP or delays DNS propagation, complaining that their store is down. | High | Low | **MEDIUM** | Automated background DNS validation job querying Cloudflare DNS over HTTPS (DoH) API, with clear step-by-step diagnostic checklists in the merchant dashboard. | Storefront remains fully accessible via default subdomain (`<tenant>.nexora.shop`) at all times. |
| **RSK-06** | **Cloud Storage Cost & Bandwidth Explosion**: Merchants upload raw 20MB uncompressed PNG/BMP images for product variants. | Med | Med | **MEDIUM** | Client-side pre-compression + server-side image processing pipeline (Sharp) that converts all uploads to optimized `.webp` with 2048px maximum bounds and 5MB upload size limits. | S3 lifecycle policies transitioning old media to cold storage; hard storage quotas enforced per subscription plan. |
| **RSK-07** | **AdSense Policy Violation from Checkout Ad Injection**: Ads rendered on checkout or cart pages, leading to Google AdSense account ban. | Low | High | **MEDIUM** | Route-level ad suppressor wrapper hard-coded in the layout renderer; strict whitelist of permitted public catalog placement slots. | Instant global kill-switch in Platform Super Admin console to disable all AdSense scripts across any tenant store. |
| **RSK-08** | **Session Compromise via Token Theft**: Attacker steals tokens via malicious browser extension. | Low | Critical | **HIGH** | Refresh tokens kept strictly in `HttpOnly`, `Secure`, `SameSite=Strict` cookies (unreachable by JavaScript); access tokens expire in 15 minutes and live only in volatile memory. | Refresh token rotation family revocation: presenting a reused refresh token immediately revokes all active sessions for that user. |

---

## 2. System Acceptance Criteria (Phase 01 Definition of Done)

Before approving Phase 01 and advancing to Phase 02, the architectural design must satisfy the following verifiable criteria:

### Multi-Tenancy & Data Isolation:
- [x] Strict tenant isolation design verified: No customer, product, order, or credential can be accessed without a matching validated `tenantId`.
- [x] Zero-trust tenant resolution: Ingress router derives tenant context solely from verified Host headers or signed JWT claims; client headers/body `tenantId` are ignored for authorization.
- [x] Distinct separation between NEXORA Platform, NEXORA Official Store (`T_NEXORA_OFFICIAL`), and autonomous Tenant Stores confirmed.

### Security & Authentication:
- [x] Password hashing specified as **Argon2id** with memory cost 64MB and 3 iterations.
- [x] Dual-token architecture verified: 15-minute in-memory JWT + 30-day `HttpOnly` `Secure` `SameSite=Strict` refresh cookie with family rotation and replay detection.
- [x] Role-Based Access Control (RBAC) matrix fully defined across 5 discrete tiers.
- [x] AES-256-GCM envelope encryption mandated for all tenant payment credentials at rest.
- [x] Server-authoritative calculation mandated for all order subtotals, discounts, taxes, and shipping fees.

### Payments & Fintech:
- [x] Universal Adapter pattern specified for domestic Bangladesh (bKash, Nagad, Rocket, SSLCommerz) and international (Stripe, PayPal) gateways.
- [x] Realistic merchant eligibility assessed: Payoneer classified and excluded from public retail consumer checkout.
- [x] Webhook signature verification and idempotency locks specified to eliminate double-spend.

### Search, Theming & AdSense:
- [x] Multi-faceted product search and filter pipeline specified using MongoDB `$facet` aggregation and Redis query cache.
- [x] Three-tier branding architecture specified with dynamic CSS variables, draft/preview/publish, and 1-click version rollback.
- [x] Google AdSense management designed with strict route suppression on checkout, cart, payment, and account pages.

### DevOps & Roadmap:
- [x] Containerized Docker multi-stage blueprint and OpenResty dynamic Let's Encrypt SSL flow specified.
- [x] Complete 30-phase implementation roadmap structured with explicit dependencies and milestones.
