# NEXORA Phase 07 — Granular Role-Based Access Control (RBAC) & Authorization Architecture

## 1. 14-Role Three-Tier Hierarchy

| Scope | Role Slug | Display Name | Rank | Primary Responsibilities |
| :--- | :--- | :--- | :---: | :--- |
| **PLATFORM** | `super_admin` | Super Admin | 100 | Root governance, platform role assignment, finance, tenants, security audits |
| **PLATFORM** | `platform_admin` | Platform Admin | 90 | Tenant lifecycle, support escalations, non-super-admin platform staff |
| **PLATFORM** | `finance_manager` | Finance Manager | 70 | SaaS subscriptions, settlement payouts, refunds, audit reads |
| **PLATFORM** | `support_agent` | Support Agent | 60 | Read-only tenant diagnostics & support escalations |
| **TENANT** | `store_owner` | Store Owner | 80 | Full tenant store sovereignty, roles, staff, products, orders, settings |
| **TENANT** | `store_admin` | Store Admin | 70 | Store operations & staff delegation below Store Owner |
| **TENANT** | `product_manager` | Product Manager | 50 | Full product catalog lifecycle (`product:*`) + inventory read |
| **TENANT** | `order_manager` | Order Manager | 50 | Order processing, status updates, and customer refunds |
| **TENANT** | `inventory_manager` | Inventory Manager | 50 | Stock quantity adjustments and warehouse controls |
| **TENANT** | `marketing_manager` | Marketing Manager | 50 | Coupons, promotional campaigns, ads, and storefront themes |
| **TENANT** | `customer_support` | Customer Support | 40 | Customer lookup, support notes, and order read visibility |
| **TENANT** | `store_staff` | Store Staff | 30 | Baseline read access + edit rights limited to own created products (`product:update:own`) |
| **STOREFRONT** | `customer` | Customer | 10 | Place orders, view/cancel strictly own orders (`storefront:order:*:own`) |
| **STOREFRONT** | `guest` | Guest | 0 | Public storefront catalog browsing only |

---

## 2. Security Invariants Enforced Server-Side

1. **Server-Authoritative Resolution**: Permissions are never read from request headers, client JSON fields, or hidden frontend UI state. Every API request resolves permissions directly from `req.auth` + server-stored `StoreMembership` & `Role`.
2. **Strict Tenant Isolation**: `requireTenantPermission` validates an `ACTIVE` `StoreMembership` inside `:tenantId`. Even a `STORE_OWNER` of Tenant A receives `403 CROSS_TENANT_ACCESS_DENIED` on Tenant B endpoints or Tenant B resource IDs.
3. **Privilege Escalation Prevention**:
   - Public registration strictly restricts `accountType` to `CUSTOMER` or `MERCHANT`.
   - `requirePlatformPermission` rejects all non-platform actors with `403 PLATFORM_ACCESS_REQUIRED`.
   - Tenant endpoints reject platform role slugs and `platform:*` permission codes (`403 PRIVILEGE_ESCALATION_BLOCKED`).
   - Hierarchy rank guards prevent `STORE_ADMIN` from promoting to `STORE_OWNER` and `PLATFORM_ADMIN` from assigning `SUPER_ADMIN`.
4. **Resource Ownership / Anti-IDOR**:
   - Customer order reads and cancellations enforce `order.tenantId === tenantId && order.customerUserId === req.auth.userId`.
   - Staff invitation acceptance enforces `invitation.email === req.auth.email`.
   - `store_staff` product modifications enforce `product.createdByUserId === req.auth.userId`.
5. **Immutable Admin Activity Logs**: All role grants/revocations, invitations, resource mutations, and denied escalation/cross-tenant/IDOR attempts are persisted to `admin_activity_logs`.
