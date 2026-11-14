# NEXORA Phase 08 — Automatic Tenant Store Creation & Official Store Architecture

## 11-Step Business Owner Onboarding Pipeline

1. **Business Owner Registration** (`POST /api/v1/onboarding/register`) — Forces `accountType: 'MERCHANT'` regardless of client payloads and creates an `OnboardingSession` at `REGISTERED`.
2. **Email Verification** (`POST /api/v1/onboarding/verify-email`) — Validates cryptographic verification token and advances onboarding state to `EMAIL_VERIFIED`.
3. **Business Information Form** (`POST /api/v1/onboarding/business-info`) — Stores legal business name, industry category, contact email, country, default currency (`BDT`/`USD`/`EUR`/`GBP`), locale (`en-BD`/`en-US`, etc.), and validated IANA timezone (`Asia/Dhaka`, etc.).
4. **Store Name Selection** & **Unique Normalized Slug Generation** (`POST /api/v1/onboarding/check-slug`) — Performs Unicode `NFKD` diacritic stripping, symbol normalization, reserved slug blocking, collision checks, and available alternative candidate suggestions.
5. **Free Plan Assignment** — Automatically attaches the `STARTER` Free Plan (`0 BDT/month`, 50 products, 2 staff seats, 1024 MB storage, 2.0% tx fee) and creates an active `Subscription` record.
6. **Tenant Creation** — Creates the `Tenant` organization strictly bound to `req.auth.userId` (`storeOwnershipType: 'INDEPENDENT_TENANT'`, `isOfficialStore: false`), rejecting any client-supplied `tenantId` or `ownerUserId`.
7. **Default Theme Assignment** — Creates initial `Theme` snapshot and `BrandingSetting` tokens (`nexora-atelier`, `nexora-minimal-studio`, or `nexora-dhaka-craft`).
8. **Default Store Settings Creation** — Creates `Store` instance with localized currency, locale, timezone, and a default regional `ShippingMethod`.
9. **Store Owner Membership Creation** — Provisions all 8 tenant RBAC roles (`store_owner` through `store_staff`) and binds the registering merchant to `store_owner`.
10. **Dashboard Redirect** — Returns the complete provisioned bundle and `dashboardUrl: /dashboard/stores/:slug`, plus server-resolved `/api/v1/onboarding/my-stores`.

## Transaction Safety, Idempotency & Lifecycle

- **Atomic Provisioning & Compensating Rollback**: Uses MongoDB `mongoose.startSession()` transactions when running on a replica set and a deterministic compensating rollback unit-of-work (`rollbackAll`) so partial failures leave zero orphaned `Tenant`, `Store`, `Subscription`, `Theme`, `BrandingSetting`, `Role`, or `StoreMembership` records.
- **Idempotent Onboarding**: Keyed by `(ownerUserId, idempotencyKey)`. Replays after success return HTTP `200` with `idempotentReplay: true` and zero duplicate documents; retries after rollback recover cleanly.
- **Lifecycle Controls**: Platform admins (`platform:tenants:manage`) can suspend (`POST /api/v1/onboarding/tenants/:tenantId/suspend`) or reactivate (`.../activate`) stores. Suspended stores block both public storefront resolution and tenant RBAC operations with `403 STORE_SUSPENDED`.

## Segregated NEXORA Official Store

- Provisioned separately (`isOfficialStore: true`, `storeOwnershipType: 'PLATFORM_OWNED_OFFICIAL'`, slug `nexora-official-flagship`) under a dedicated `MERCHANT` service owner (`officialstore@nexora.shop`).
- Strictly isolated from platform administration: Official Store staff never inherit `platform:*` permissions, and Platform Admins do not implicitly hold tenant-level catalog/order write permissions on the Official Store.
