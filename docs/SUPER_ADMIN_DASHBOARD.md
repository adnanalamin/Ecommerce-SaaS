# NEXORA Phase 09 — Super Admin Governance Dashboard Specification

## 1. Overview & Architecture
The NEXORA Super Admin Dashboard (`/api/v1/platform`) provides platform-owner observability, tenant & store lifecycle control, financial monitoring, platform-wide branding/settings, audit logging, and controlled tenant support access.

All routes enforce:
- **Cookie-backed Authentication & CSRF** (`requirePlatformPermission` + `X-CSRF-Token` on state-changing routes)
- **Role-Based Dashboard Access** (`super_admin`, `platform_admin`, `finance_manager`, `support_agent`)
- **Hard Tenant Boundary Protection**: Merchants and Storefront Customers always receive `403 FORBIDDEN`.
- **Zero-Standing-Privilege Tenant Isolation**: Platform admins never gain unrestricted reads into tenant private records.

## 2. Executive Overview Metrics & Aggregations
`GET /api/v1/platform/overview` (`platform:tenants:read`) aggregates live platform state:
- **Tenant & Store Totals**: Total tenants, active stores, suspended stores, official NEXORA flagship count (`OFFICIAL_PLATFORM` vs `MERCHANT_TENANT`).
- **User & Subscription Metrics**: Total registered users, active users, active subscriptions, Free (`STARTER`) vs Paid (`GROWTH`, `PRO`, `ENTERPRISE`) counts.
- **Revenue & Financial Telemetry**: Subscription MRR (`BDT` & `USD`), total payment volume, payment status breakdown, pending refunds count, and recent platform transactions.
- **Charts & Infrastructure**: 6-month aggregated revenue & transaction trajectory, plan distribution, tenant storage utilization vs quota (`storageUsedMB / storageQuotaMB`), process health (`uptimeSeconds`, `memoryRssMB`, `heapUsedMB`, `activeSessions`), and derived security alerts.

## 3. Governance Modules & API Matrix

| Module | Endpoint(s) | Required Permission | Destructive Confirmation |
|---|---|---|---|
| Overview | `GET /api/v1/platform/overview` | `platform:tenants:read` | — |
| Tenant Management | `GET /tenants`, `PATCH /tenants/:id/status`, `DELETE /tenants/:id` | `platform:tenants:read`, `platform:tenants:manage` | Suspend / Archive (`NEXORA Official` archive blocked) |
| Store Management | `GET /tenants` (storefront projection + ownership) | `platform:tenants:read`, `platform:tenants:manage` | Suspend Store |
| User Management | `GET /users`, `PATCH /users/:id/status`, `POST /users/:id/revoke-sessions` | `platform:tenants:read`, `platform:tenants:manage` | Suspend User / Revoke All Sessions |
| Admin Management | `GET /admins`, `POST /admins/assign`, `POST /admins/revoke` | `platform:tenants:read`, `platform:roles:assign` | Revoke Platform Role |
| Subscriptions | `GET /subscriptions`, `PATCH /subscriptions/:tenantId` | `platform:finance:read`, `platform:finance:manage` | Suspend / Cancel Subscription |
| Plans | `GET /plans`, `PATCH /plans/:code` | `platform:finance:read`, `platform:finance:manage` | — |
| Payment Monitoring | `GET /payments`, `PATCH /payments/:id/reconcile` | `platform:finance:read`, `platform:finance:manage` | Reverse / Fail Settled Payment |
| Refund Monitoring | `GET /refunds`, `PATCH /refunds/:id` | `platform:finance:read`, `platform:finance:manage` | Reject Refund |
| Ad Governance | `GET /ads`, `PATCH /ads/:tenantId` | `platform:ads:manage` | Disable Tenant Ads (ADR-011 `/checkout`, `/cart`, `/payment` immutable) |
| Platform Branding | `GET /branding`, `PATCH /branding` | `platform:settings:manage` | — |
| Global Settings | `GET /settings`, `PATCH /settings/:key` | `platform:settings:manage` | Enable Maintenance Mode |
| Audit Logs | `GET /audit-logs` | `platform:audit:read` | — |
| CSV Exports | `GET /export/:dataset` (`tenants`, `users`, `payments`, `refunds`, `audit_logs`) | `platform:export:data` | Formula-injection safe CSV quoting |
| Support & Access | `GET/PATCH /support/tickets*`, `GET/POST /support/access-grants*`, `GET /support/tenants/:id/diagnostics` | `platform:support:manage` | Revoke Active Support Grant |

## 4. Controlled & Logged Support Access Design
Platform admins and support agents are strictly blocked from viewing tenant private diagnostics without explicit, audited authorization:
1. **Unrestricted Read Blocked**: Calling `GET /api/v1/platform/support/tenants/:tenantId/diagnostics` without an active grant immediately returns `403 SUPPORT_ACCESS_REQUIRED` and records a `DENIED` `SUPPORT_ACCESS_BLOCKED` audit entry.
2. **Ticket-Bound Grant Issuance**: `POST /api/v1/platform/support/access-grants` validates an open, non-closed `SupportTicket` owned by the target `tenantId`, enforces a 10+ character justification, and clamps TTL between 5 and 60 minutes.
3. **Scoped & Redacted Read**: With an active grant, diagnostics return only scoped metadata and redacted order rows (`customerEmail` masked; payment gateway secrets never returned) while logging `SUPPORT_DATA_ACCESSED`.
4. **Immediate Revocation & Expiry**: Revoking a grant (`POST /support/access-grants/:grantId/revoke`) or TTL expiration immediately reverts subsequent diagnostics requests to `403`.

## 5. Verification
Run the live Express middleware verification suite via:
```bash
npm run platform:test
```
Covers `PLT-01` through `PLT-10`: aggregations, RBAC role boundaries, CSV export gating, tenant/official-store protections, financial governance, global settings/ADR-011 exclusions, and controlled support access grants/revocation/expiry.
