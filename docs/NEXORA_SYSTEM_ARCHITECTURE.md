# NEXORA System Architecture Specification
## Document Version: 1.0.0 — Phase 01 Master Architecture
**Platform**: NEXORA Multi-Tenant SaaS E-Commerce Store Builder  
**Author**: Principal Software Architect & Systems Engineering Team  
**Status**: APPROVED FOR ARCHITECTURAL REVIEW (Pre-Phase 02)

---

## 1. Executive Summary & Vision

NEXORA is a high-performance, multi-tenant SaaS e-commerce store builder engineered for sovereign, isolated merchant storefronts with international and Bangladesh-localized checkout capabilities. 

Unlike traditional multi-vendor marketplaces (such as Amazon, Daraz, or Etsy) where merchant products coexist in a shared catalog and customers check out across multiple vendors simultaneously, NEXORA operates as an **Autonomous Tenant Store Builder** (analogous to Shopify or BigCommerce). Each registered merchant receives an independent e-commerce business operating on its own subdomain or custom top-level domain, with an isolated data scope, isolated customer directory, private inventory, dedicated order management, custom branding, independent payment gateway credentials, and configurable advertisement policies.

Simultaneously, the platform architecture accommodates:
1. **NEXORA SaaS Platform**: The master subscription, tenant provisioning, domain management, billing, and platform governance engine operated by the Platform Super Admin.
2. **NEXORA Official Store**: A first-party flagship retail store owned and operated by the platform owner selling physical branded goods, completely separated logically and operationally from third-party tenant stores.
3. **Tenant Stores**: Hundreds or thousands of autonomous, isolated e-commerce stores created programmatically upon merchant onboarding.

---

## 2. High-Level System Architecture

```mermaid
flowchart TB
    subgraph Clients["Shoppers, Merchants & Admins"]
        C1["Shopper on Custom Domain<br/>(e.g., store.artisan.bd)"]
        C2["Shopper on Subdomain<br/>(e.g., urbanwear.nexora.shop)"]
        C3["Merchant Admin & Staff<br/>(Dashboard Portal)"]
        C4["Platform Super Admin<br/>(NEXORA Master Operations)"]
    end

    subgraph Edge["Edge & Ingress Tier"]
        DNS["Cloudflare / Route53 DNS<br/>(Wildcard *.nexora.shop + CNAMEs)"]
        WAF["Cloudflare WAF & DDoS Shield<br/>(Rate Limiting & Geo-Rules)"]
        NGINX["Nginx / OpenResty Dynamic Ingress<br/>- SSL Auto-termination (Let's Encrypt)<br/>- Dynamic Tenant Domain Resolution<br/>- Static Asset Caching"]
    end

    subgraph Frontend["Frontend Tier (React + Vite SPA)"]
        FE_Store["Storefront Engine<br/>- Dynamic Theme Renderer<br/>- Responsive Product Browsing<br/>- Cart & Checkout Adapter<br/>- AdSense Placement Slots"]
        FE_Merchant["Tenant Admin Dashboard<br/>- Product / Variant Manager<br/>- Order & Fulfillment Center<br/>- Theme Studio & Branding<br/>- Gateway Credentials Vault"]
        FE_Super["Platform Super Admin Console<br/>- Tenant Governance & Lifecycle<br/>- Subscription Billing Engine<br/>- Global Security & Audit Vault"]
        FE_Official["NEXORA Official Flagship Store<br/>- 1P Sovereign Storefront"]
    end

    subgraph Backend["Application Server Tier (Node.js + Express + TypeScript)"]
        API_GW["Express API Gateway & Middleware<br/>- Helmet, CORS Allowlist, RateLimiter<br/>- AsyncLocalStorage Tenant Context<br/>- JWT & HttpOnly Session Authenticator<br/>- Zod Schema Sanitizer & Validator"]
        
        subgraph Domains["Modular Domain Services"]
            S_Tenant["Tenant Provisioning & Lifecycle Service"]
            S_Auth["Auth, MFA & RBAC Service (Argon2id)"]
            S_Catalog["Product, SKU, Variant & Taxonomy Service"]
            S_Order["Order Engine & State Machine"]
            S_Payment["Payment Adapter Hub (bKash, Nagad, Rocket, SSL, Stripe, PayPal)"]
            S_Billing["SaaS Subscription & Billing Engine"]
            S_Brand["Branding & Dynamic Theme Engine"]
            S_Search["Faceted Search & Filter Engine"]
            S_Ad["AdSense & Ad Unit Placement Manager"]
            S_Audit["Audit Logging & Compliance Service"]
        end
    end

    subgraph CacheQueue["Caching & Asynchronous Processing Tier"]
        REDIS["Redis In-Memory Cluster<br/>- Tenant Configuration Cache<br/>- Active Session & Token Revocation Blacklist<br/>- Rate Limiting Counters<br/>- Distributed Mutex Locks (Redlock)"]
        BULLMQ["BullMQ Distributed Job Queues<br/>- Payment Webhook Reconciler<br/>- Order Status Notifications (SMS/Email)<br/>- Inventory Reorder Alerts<br/>- Custom Domain SSL Renewal Queue"]
    end

    subgraph Workers["Background Asynchronous Workers"]
        W_Notify["Notification Worker (SendGrid, Twilio, BulkSMSBD)"]
        W_Payment["Payment Settlement & Idempotency Worker"]
        W_Analytics["Tenant Metrics & Analytics Aggregator"]
        W_SSL["Certbot / Let's Encrypt ACME Certificate Worker"]
    end

    subgraph Database["Persistence & Storage Tier"]
        MONGO[("MongoDB Replica Set<br/>- Tenant Partitioned Collections<br/>- Compound Tenant Indexes<br/>- ACID Multi-Document Transactions")]
        S3[("S3 / Cloudinary Object Storage<br/>- Merchant Logos, Favicons, Media<br/>- Product Variant Photography<br/>- Signed Temporary URLs")]
    end

    subgraph External["Third-Party Service Providers"]
        P_BD["Bangladesh Gateways<br/>(bKash, Nagad, Rocket, SSLCommerz)"]
        P_INTL["International Gateways<br/>(Stripe, PayPal)"]
        P_COMM["SMS / Email Gateways<br/>(BulkSMSBD, Onnorokom, SendGrid)"]
        ADS["Google AdSense Network"]
    end

    %% Routing Connections
    Clients --> DNS --> WAF --> NGINX
    NGINX --> Frontend
    Frontend --> API_GW
    API_GW --> Domains
    Domains <--> REDIS
    Domains --> BULLMQ
    BULLMQ --> Workers
    Workers --> P_COMM
    Workers --> W_SSL
    Domains <--> MONGO
    Domains <--> S3
    S_Payment <--> P_BD
    S_Payment <--> P_INTL
    FE_Store <--> ADS
```

---

## 3. Tier Responsibilities & Structural Boundaries

### 3.1 Frontend Responsibilities (React, Vite, TypeScript, Tailwind CSS, Redux Toolkit)
- **Zero-Trust Client Boundary**: The frontend is treated as completely untrusted. It never computes prices, final discounts, order subtotals, tax rates, inventory deduction states, or tenant identity.
- **Dynamic Storefront Re-theming**: Reads a tenant-specific CSS Variable Token dictionary (`--nexora-primary`, `--nexora-radius`, `--nexora-font-heading`) generated server-side and injects them without full bundle recompilations.
- **Micro-State Partitioning**:
  - Global Session / Auth slice in Redux Toolkit with silent refresh interceptors.
  - Cart slice maintaining local state synced with backend reserve-stock validation.
  - Faceted Search filter slice synchronized with URL search params (`URLSearchParams`).
- **Responsive Ad Slot Host**: Provides semantic containers (`<AdSlot slotId="header-leaderboard" />`) with built-in consent wrappers (GDPR/ePrivacy compliance) and automatic suppression on checkout/sensitive routes.

### 3.2 Backend Responsibilities (Node.js, Express, TypeScript)
- **Tenant Context Assertion**: The first middleware in the pipeline resolves the incoming request's host header or authorization token to a verified `tenantId`. This is injected into Node's `AsyncLocalStorage` (`RequestContext`), ensuring that downstream services never require manual tenant ID passing that could lead to developer error.
- **Declarative Zod Validation**: Every incoming payload is validated against strict Zod schemas with `.strict()` enabled to strip any unauthorized prototype pollution or unexpected fields.
- **State Machine Integrity**: Orders, payments, and subscriptions progress through rigid state machines (e.g., `PENDING` -> `PAYMENT_AUTHORIZED` -> `PROCESSING` -> `SHIPPED` -> `DELIVERED`). Illegal transitions trigger immediate rollbacks.
- **Secrets Management**: Tenant-specific payment credentials (bKash app secrets, Stripe secret keys, SSLCommerz store passwords) are encrypted at rest using AES-256-GCM with envelope encryption before saving to the database.

### 3.3 Database Responsibilities (MongoDB Replica Set & Mongoose)
- **ACID Transactions**: Financial operations (order placement, inventory deduction, wallet balance updates) utilize MongoDB Multi-Document Transactions with `readConcern: "majority"` and `writeConcern: { w: "majority" }`.
- **Compound Tenant Indexing**: Every multi-tenant collection mandates a compound index beginning with `{ tenantId: 1, ... }` to ensure zero table scans and physical isolation within query planners.
- **Tenant Isolation Mongoose Middleware**: Global Mongoose plugins intercept `find`, `findOne`, `countDocuments`, `updateMany`, and `deleteMany` to enforce `tenantId` filtering unconditionally.

### 3.4 Caching & Queuing Responsibilities (Redis & BullMQ)
- **Redis Cache Layer**:
  - `tenant:config:<host>`: Cached tenant metadata, theme tokens, and active subscription status (TTL: 15 minutes, invalidated on admin update).
  - `auth:blacklist:<jti>`: Denied access tokens and revoked refresh tokens.
  - `rate:ip:<ip>` and `rate:tenant:<tenantId>`: Sliding-window rate limit counters.
  - Distributed locks (`Redlock`) to prevent race conditions during high-concurrency flash sales (e.g., preventing two shoppers from buying the final unit of an item).
- **BullMQ Asynchronous Job Queues**:
  - High-priority `payment-webhooks` queue with automatic exponential backoff (1s, 5s, 15s, 60s).
  - Background `email-sms-dispatch` queue to prevent external network latency from stalling API responses.
  - `analytics-rollup` queue for aggregating daily sales, store visits, and revenue.

### 3.5 Storage Responsibilities (S3-Compatible / Cloudinary)
- **Tenant-Scoped Object Keys**: All uploaded assets follow the strict key hierarchy: `tenants/{tenantId}/{category}/{uuid}-{sanitized-filename}.webp`.
- **Image Processing Pipeline**: Automated conversion to modern `.webp` and `.avif` formats with thumbnail and responsive srcset generation.
- **MIME & Magic Number Verification**: File uploads undergo binary magic number inspection (e.g., verifying `FF D8 FF` for JPEG) to prevent malicious executable uploads disguised as images.

---

## 4. Platform Separation Architecture

NEXORA structurally and operationally segregates three distinct business entities:

```mermaid
graph TD
    subgraph NEXORA_ECOSYSTEM["NEXORA Ecosystem Separation"]
        subgraph P1["1. NEXORA SaaS Platform"]
            P1_Admin["Super Admin Operations"]
            P1_DB["Global Collections:<br/>Tenants, Plans, Subscriptions,<br/>Platform Admins, System Audit"]
            P1_Revenue["SaaS Revenue & Billing Engine"]
            P1_Domain["Global Host: nexora.com / app.nexora.com"]
        end

        subgraph P2["2. NEXORA Official Store"]
            P2_Admin["Flagship Store Operations"]
            P2_DB["Tenant ID: 'T_NEXORA_OFFICIAL'<br/>Sovereign Catalog, 1P Physical Inventory,<br/>Direct Order Fulfillment"]
            P2_Branding["Flagship Brand Identity"]
            P2_Domain["Store Host: store.nexora.com"]
        end

        subgraph P3["3. Autonomous Tenant Stores"]
            P3_T1["Tenant A: 'T_URBAN_WEAR'<br/>urbanwear.nexora.shop"]
            P3_T2["Tenant B: 'T_ARTISAN_BD'<br/>store.artisan.bd"]
            P3_TN["Tenant N: 'T_N_MERCHANT'<br/>..."]
            P3_Data["Completely Isolated Merchant Data:<br/>Products, Orders, Customers, Gateways"]
        end
    end

    P1 -->|"Provisions & Monitors"| P2
    P1 -->|"Provisions & Enforces Subscriptions"| P3
```

### Separation Rules:
1. **Tenant ID `T_NEXORA_OFFICIAL`**: The official store is treated internally as a premier tenant record with infinite subscription limits, zero commission fees, and permanent active status, ensuring it utilizes the same rock-solid storefront code path as tenants while guaranteeing that platform administrative data never touches storefront data.
2. **Customer Identity Separation**: A customer registered at `urbanwear.nexora.shop` cannot log into `store.artisan.bd` or `store.nexora.com` using the same session. User identity is strictly isolated by `(tenantId, email)`.
3. **Database Boundary**: Platform admin credentials exist in the `PlatformUsers` collection, while merchant staff and customers exist in the `TenantUsers` collection. A compromised tenant credential can never elevate to platform operations.
