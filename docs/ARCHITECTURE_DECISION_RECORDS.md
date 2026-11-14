# Architecture Decision Records (ADRs)
## Platform: NEXORA Multi-Tenant SaaS E-Commerce Store Builder
**Document Version**: 1.0.0 — Phase 01 Master Records  
**Status**: ACCEPTED & IMMUTABLE

---

### Table of Architectural Decisions
- **ADR-001**: Multi-Tenancy Strategy: Shared Database with Logical Discriminator & AsyncLocalStorage Context
- **ADR-002**: Context Propagation via Node.js AsyncLocalStorage
- **ADR-003**: Password Hashing Algorithm Selection: Argon2id
- **ADR-004**: Session Management via Short-Lived Access Tokens & HttpOnly Refresh Token Rotation
- **ADR-005**: Segregation of NEXORA Official Flagship Store from Platform Administration
- **ADR-006**: Server-Authoritative Order Calculation & Inventory Race Prevention
- **ADR-007**: Universal Payment Gateway Adapter Pattern for Bangladesh & Global Acquiring
- **ADR-008**: Classification & Storefront Exclusion of Payoneer as a B2C Checkout Provider
- **ADR-009**: Dynamic CSS Custom Properties (Variables) for Real-Time Tenant Storefront Theming
- **ADR-010**: MongoDB `$facet` Aggregation Pipeline & Redis Query Fingerprinting for Faceted Search
- **ADR-011**: Zero-Ad Policy on Sensitive Financial, Cart, Checkout, and Authentication Routes
- **ADR-012**: Automated Dynamic SSL Provisioning for Custom Merchant Domains via OpenResty & ACME

---

### ADR-001: Multi-Tenancy Strategy: Shared Database with Discriminator (`tenantId`)
- **Status**: ACCEPTED
- **Context**: NEXORA must support thousands of autonomous merchant stores cost-effectively while guaranteeing strict data isolation. Database-per-tenant introduces massive connection pooling exhaustion in Node.js and renders schema migrations unmanageable.
- **Decision**: Adopt a shared MongoDB database where every multi-tenant document contains a mandatory `tenantId: ObjectId`. Isolation is enforced by a global Mongoose query interceptor plugin and compound indexing starting with `{ tenantId: 1, ... }`.
- **Consequences**:
  - *Positive*: Uncapped tenant scalability on shared infrastructure; unified schema migrations; optimal resource utilization.
  - *Negative*: Demands zero-defect enforcement at the database plugin layer to prevent unauthorized cross-tenant queries.

---

### ADR-002: Context Propagation via Node.js AsyncLocalStorage
- **Status**: ACCEPTED
- **Context**: Manually passing `tenantId` across dozens of controllers, services, repositories, and helper functions is prone to developer oversight, potentially creating critical cross-tenant data leaks.
- **Decision**: Utilize Node.js native `AsyncLocalStorage` (`tenantStorage`) initialized by early ingress middleware. All downstream services retrieve the validated tenant context automatically without explicit argument passing.
- **Consequences**:
  - *Positive*: Eliminates human error in tenant scoping; guarantees thread-like local context across asynchronous promises.
  - *Negative*: Must guard against unbound asynchronous execution contexts (unhandled background timers).

---

### ADR-003: Password Hashing Algorithm Selection: Argon2id
- **Status**: ACCEPTED
- **Context**: Traditional Bcrypt algorithms lack memory-hardness and are increasingly vulnerable to high-throughput GPU/ASIC password cracking clusters.
- **Decision**: Mandate **Argon2id** (`m=65536`, `t=3`, `p=4`) for all user and admin password hashing.
- **Consequences**:
  - *Positive*: Maximizes resistance against both GPU-accelerated brute force and side-channel cache timing attacks; compliant with OWASP password storage recommendations.
  - *Negative*: Slightly higher CPU/memory usage per login attempt; mitigated by rate limiting auth endpoints to 5 attempts per minute.

---

### ADR-004: Dual-Token Session Model with Refresh Token Rotation
- **Status**: ACCEPTED
- **Context**: Storing JWT access tokens in browser `localStorage` exposes them to XSS exfiltration. Using long-lived access tokens makes revocation difficult.
- **Decision**: Implement short-lived (15-minute) JWT access tokens kept strictly in memory, coupled with high-entropy cryptographic refresh tokens stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookies. On every refresh, the old token is invalidated and a new one issued. If an already-used refresh token is presented, the entire token family is immediately revoked.
- **Consequences**:
  - *Positive*: Complete immunity of refresh tokens to XSS attacks; immediate detection and neutralization of token replay attacks.
  - *Negative*: Requires seamless client-side Axios/Fetch interceptor to handle silent token renewals without disrupting user actions.

---

### ADR-005: Segregation of NEXORA Official Flagship Store from Platform Administration
- **Status**: ACCEPTED
- **Context**: NEXORA operates both a SaaS software platform and a first-party physical retail store ("NEXORA Official Store"). These two businesses must not blur operational data or user credentials.
- **Decision**: Model the NEXORA Official Store as a sovereign tenant entity with a reserved immutable identifier (`T_NEXORA_OFFICIAL`). It utilizes the standard tenant storefront runtime and catalog schema, while platform administration operates at a higher logical tier with distinct database collections.
- **Consequences**:
  - *Positive*: Clean operational separation; platform admin credentials cannot be compromised through storefront vulnerabilities; official store benefits from the exact same features as tenant stores.
  - *Negative*: Official store must adhere to standard tenant domain routing conventions (`store.nexora.com`).

---

### ADR-006: Server-Authoritative Order Calculation & Inventory Race Prevention
- **Status**: ACCEPTED
- **Context**: Malicious shoppers can intercept and modify HTTP payloads to submit fraudulent prices, invalid discount codes, or negative quantities. Simultaneous orders during flash sales can lead to overselling.
- **Decision**: Total prices, taxes, discounts, and shipping charges are computed exclusively on the server within a MongoDB ACID transaction. Stock is checked and locked using Redis distributed mutex locks (`Redlock`), preventing overselling.
- **Consequences**:
  - *Positive*: Zero possibility of client-side price tampering or inventory overdraft.
  - *Negative*: Transactional locking overhead during high-concurrency flash sales; resolved via optimized row-level variant indexing.

---

### ADR-007: Universal Payment Gateway Adapter Pattern
- **Status**: ACCEPTED
- **Context**: The platform must support multiple Bangladesh gateways (bKash, Nagad, Rocket, SSLCommerz) and international gateways (Stripe, PayPal) without polluting the core checkout logic.
- **Decision**: Define a strongly-typed `IPaymentGatewayAdapter` interface. Each gateway encapsulates its own session initiation, webhook verification, and refund mechanics.
- **Consequences**:
  - *Positive*: Modular, extensible design; adding a new payment gateway requires implementing a single class without modifying existing order code.
  - *Negative*: Must standardize heterogeneous error codes and response payloads from disparate providers.

---

### ADR-008: Classification & Storefront Exclusion of Payoneer as a B2C Checkout Provider
- **Status**: ACCEPTED
- **Context**: Inquiries regarding using Payoneer as a direct retail consumer checkout method for Bangladesh merchants.
- **Decision**: Formally classify Payoneer as a **Cross-Border B2B Payout & Invoicing Service**, not an acquiring gateway for consumer retail shopping carts. Payoneer is strictly **EXCLUDED** from the public storefront checkout methods.
- **Consequences**:
  - *Positive*: Prevents high cart abandonment, regulatory confusion, and non-viable checkout user journeys.
  - *Negative*: Merchants with only a Payoneer account must use domestic acquiring (bKash, SSLCommerz) or Stripe Atlas for customer checkouts.

---

### ADR-009: Dynamic CSS Custom Properties for Storefront Theming
- **Status**: ACCEPTED
- **Context**: Recompiling CSS or triggering Vite builds whenever a merchant updates their store brand colors or fonts is unscalable.
- **Decision**: Storefront themes are defined as a JSON dictionary of CSS Custom Properties (`--nexora-primary`, `--nexora-font-heading`) injected into the DOM via an inline `<style>` block at runtime.
- **Consequences**:
  - *Positive*: Instantaneous theme updates without build pipelines; zero server load; seamless live preview iframe integration.
  - *Negative*: Themes must be structured around a predefined token system rather than allowing arbitrary raw HTML/CSS uploads (which is also a major security benefit against XSS).

---

### ADR-010: MongoDB `$facet` Aggregation Pipeline for Real-Time Search & Filtering
- **Status**: ACCEPTED
- **Context**: Returning paginated products along with real-time checkbox counts for categories, brands, price ranges, and ratings usually requires 5 to 6 separate database queries.
- **Decision**: Execute faceted search via a single MongoDB `$facet` aggregation stage, coupled with Redis query fingerprint caching (TTL: 120s).
- **Consequences**:
  - *Positive*: Single database roundtrip; sub-50ms response times; accurate dynamic counts.
  - *Negative*: Complex aggregation pipeline requiring careful indexing to prevent memory limits (`allowDiskUse` guarded).

---

### ADR-011: Zero-Ad Policy on Sensitive Financial, Cart, and Checkout Routes
- **Status**: ACCEPTED
- **Context**: AdSense and third-party advertising scripts execute arbitrary JavaScript that could potentially inspect DOM elements, track user input, or distract shoppers during critical conversion moments.
- **Decision**: Google AdSense and promotional banner placements are strictly forbidden and blocked at the component wrapper level on `/cart`, `/checkout/*`, `/payment/*`, `/orders/confirmed`, and `/account/*`.
- **Consequences**:
  - *Positive*: Guarantees PCI-DSS and privacy hygiene; maximizes checkout conversion rates; eliminates ad-induced checkout abandonment.
  - *Negative*: Minor reduction in ad impression opportunities for ad-heavy merchants.

---

### ADR-012: Automated Dynamic SSL Provisioning via OpenResty & ACME
- **Status**: ACCEPTED
- **Context**: Merchants configuring custom domains (`store.artisan.bd`) require valid HTTPS certificates without platform engineers manually intervening or restarting Nginx.
- **Decision**: Deploy OpenResty with `lua-resty-auto-ssl`. On the first incoming TLS handshake, OpenResty verifies tenant domain authorization against the NEXORA API and programmatically obtains an X.509 certificate from Let's Encrypt via HTTP-01 challenge.
- **Consequences**:
  - *Positive*: 100% automated custom domain SSL provisioning; zero downtime; automatic renewal.
  - *Negative*: First HTTPS request to a newly configured domain experiences a 2-second certificate issuance latency before caching.
