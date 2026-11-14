# NEXORA Phase 10 — Tenant Store Owner Dashboard

## Overview & Aggregations
The Tenant Store Owner Dashboard (`/api/v1/tenant/:tenantId/*`) provides a strictly isolated merchant operating system covering:
- **Sales & Revenue**: Live order ledger + catalog historical units sold, gross revenue (BDT), refunded total, and Average Order Value (AOV).
- **Orders**: Total orders and per-status breakdown (`PENDING`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `REFUNDED`).
- **Customers**: Total customers, VIP segment count, repeat customer percentage.
- **Products & Low Stock**: Published/draft counts, total stock units, and SKUs at or below `lowStockThreshold`.
- **Best-Selling Products & Recent Orders**: Ranked catalog performers and latest storefront checkouts.
- **Measurable Conversion Metrics**: End-to-end funnel (`storefrontSessions` -> `productViews` -> `cartAdditions` -> `checkoutInitiated` -> `completedOrders`) with Add-to-Cart %, Checkout Completion %, and Overall Conversion %.
- **Subscription Status & Quotas**: Plan tier, billing cycle, renewal window, transaction fee %, and live product/staff/storage quota meters.

## 15 Store Modules
1. **Product Management**: Create, edit, publish/draft/archive, delete, and search SKUs (enforcing plan `maxProducts` quota and `product:update:own` vs `product:update`).
2. **Category Management**: Create and remove storefront categories.
3. **Brand Management**: Manage house and partner brands.
4. **Inventory**: Adjust warehouse stock levels and thresholds with immutable movement audit history (`INVENTORY_ADJUSTED`).
5. **Orders**: Filter, inspect, and transition fulfillment statuses (`order:refund` required for `REFUNDED`).
6. **Customers**: Search shoppers, segment (`VIP`, `RETURNING`, `NEW`, `AT_RISK`), and update CRM notes.
7. **Coupons**: Create, toggle, and delete promo voucher codes.
8. **Discounts**: Launch and manage automatic cart/flash-sale/bulk-tier discount campaigns.
9. **Store Settings**: Currency, VAT rate, tax-inclusive toggle, guest checkout, and custom domain.
10. **Staff Management**: View active store memberships, invite staff within plan seat limits and hierarchy rank, and revoke members.
11. **Store Branding**: Customize theme code, hex palette, announcement bar, hero copy, and live preview.
12. **Payment Settings**: Toggle and configure store gateways (`BKASH`, `SSLCOMMERZ`, `NAGAD`, `COD`, `STRIPE`) with server-masked account numbers (raw API secrets are never returned).
13. **Shipping Settings**: Configure zones, carriers, base rates, free-shipping thresholds, and COD eligibility.
14. **Analytics**: Category revenue share, gross margin %, funnel visualization, and automated isolation verifier.
15. **Subscription Management**: Switch billing cycles and upgrade/downgrade tiers with quota validation.

## Strict Tenant Isolation & Security
- Every `/:tenantId/*` endpoint passes through `requireTenantPermission(...)`, which resolves `req.tenantAuth.tenantId` exclusively from the authenticated user's verified `StoreMembership` in that tenant.
- Client-supplied `tenantId` in request bodies is rejected by `.strict()` Zod schemas.
- All repository reads, updates, and deletes assert `entity.tenantId === tenantId`, returning `403 CROSS_TENANT_ACCESS_DENIED` on cross-tenant IDOR probes.

## Two-Tenant Verification Suite (`npm run tenant:test`)
- `TNT-01`: Tenant A (`UrbanWear BD`) overview aggregations, conversion funnel & plan quotas.
- `TNT-02`: Tenant B (`LuxeThread Studio`) disjoint catalog, orders & overview verification.
- `TNT-03`: Cross-tenant isolation & anti-IDOR proof (`403 CROSS_TENANT_ACCESS_DENIED` on Tenant B routes & resource IDs).
- `TNT-04` – `TNT-10`: Catalog CRUD, inventory audit logs, orders/customers, coupons/discounts, settings/branding/secret-safe payments/shipping, RBAC boundaries (`product_manager` & `customer` 403), and analytics/subscription lifecycle.
