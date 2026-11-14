/**
 * NEXORA Granular RBAC Permissions & 14-Role Hierarchy Catalog
 * Platform (4), Tenant (8), and Storefront (2)
 */

import type { PermissionModule } from '../db/schemas/tenant/stores.ts';
import type { UserType } from '../db/schemas/global/users.ts';

export type RoleScope = 'PLATFORM' | 'TENANT' | 'STOREFRONT';

export type PlatformRoleSlug =
  | 'super_admin'
  | 'platform_admin'
  | 'support_agent'
  | 'finance_manager';

export type TenantRoleSlug =
  | 'store_owner'
  | 'store_admin'
  | 'product_manager'
  | 'order_manager'
  | 'inventory_manager'
  | 'marketing_manager'
  | 'customer_support'
  | 'store_staff';

export type StorefrontRoleSlug = 'customer' | 'guest';

export type RoleSlug = PlatformRoleSlug | TenantRoleSlug | StorefrontRoleSlug | string;

export interface PermissionDefinition {
  code: string;
  name: string;
  description: string;
  module: PermissionModule;
  scope: RoleScope;
}

export const PERMISSIONS_CATALOG: PermissionDefinition[] = [
  // PLATFORM SCOPE
  { code: 'platform:tenants:read', name: 'View All Tenants', description: 'Inspect tenant organizations and store metadata.', module: 'PLATFORM', scope: 'PLATFORM' },
  { code: 'platform:tenants:manage', name: 'Manage Tenants', description: 'Suspend, activate, or configure platform tenants.', module: 'PLATFORM', scope: 'PLATFORM' },
  { code: 'platform:roles:assign', name: 'Assign Platform Roles', description: 'Assign or revoke platform-level administrative roles.', module: 'PLATFORM', scope: 'PLATFORM' },
  { code: 'platform:finance:read', name: 'View Platform Finance', description: 'View SaaS subscriptions, GMV settlements, and fee ledgers.', module: 'FINTECH', scope: 'PLATFORM' },
  { code: 'platform:finance:manage', name: 'Manage Platform Finance', description: 'Approve payouts, plans, and platform-level refunds.', module: 'FINTECH', scope: 'PLATFORM' },
  { code: 'platform:support:manage', name: 'Platform Support Operations', description: 'Investigate merchant support escalations and diagnostics.', module: 'PLATFORM', scope: 'PLATFORM' },
  { code: 'platform:audit:read', name: 'Read Platform Audit Logs', description: 'Query platform-wide governance and RBAC security logs.', module: 'AUDIT', scope: 'PLATFORM' },

  // TENANT SCOPE — PRODUCTS
  { code: 'product:read', name: 'View Products', description: 'Read store products, categories, brands, and variants.', module: 'PRODUCTS', scope: 'TENANT' },
  { code: 'product:create', name: 'Create Products', description: 'Create new products and variant SKUs inside store.', module: 'PRODUCTS', scope: 'TENANT' },
  { code: 'product:update:own', name: 'Update Own Products', description: 'Edit products created by the current staff member.', module: 'PRODUCTS', scope: 'TENANT' },
  { code: 'product:update', name: 'Update Any Store Product', description: 'Edit any product belonging to the tenant store.', module: 'PRODUCTS', scope: 'TENANT' },
  { code: 'product:delete', name: 'Delete Products', description: 'Archive or delete products inside the tenant store.', module: 'PRODUCTS', scope: 'TENANT' },

  // TENANT SCOPE — INVENTORY
  { code: 'inventory:read', name: 'View Inventory', description: 'Inspect stock counts, reservations, and reorder alerts.', module: 'INVENTORY', scope: 'TENANT' },
  { code: 'inventory:update', name: 'Adjust Inventory', description: 'Update warehouse stock levels and safety thresholds.', module: 'INVENTORY', scope: 'TENANT' },

  // TENANT SCOPE — ORDERS
  { code: 'order:read', name: 'View Store Orders', description: 'Read all orders within the tenant store.', module: 'ORDERS', scope: 'TENANT' },
  { code: 'order:update', name: 'Update Order Status', description: 'Advance fulfillment, shipping, and processing states.', module: 'ORDERS', scope: 'TENANT' },
  { code: 'order:refund', name: 'Issue Order Refunds', description: 'Authorize partial or full order refunds.', module: 'FINTECH', scope: 'TENANT' },

  // TENANT SCOPE — CUSTOMERS & SUPPORT
  { code: 'customer:read', name: 'View Store Customers', description: 'Read customer profiles and order history for the tenant.', module: 'CUSTOMERS', scope: 'TENANT' },
  { code: 'customer:support', name: 'Manage Customer Support', description: 'Handle customer support notes, returns, and review moderation.', module: 'CUSTOMERS', scope: 'TENANT' },

  // TENANT SCOPE — MARKETING & THEMES
  { code: 'marketing:manage', name: 'Manage Marketing & Coupons', description: 'Create coupons, promotions, advertisements, and CMS content.', module: 'MARKETING', scope: 'TENANT' },
  { code: 'theme:manage', name: 'Manage Themes & Branding', description: 'Customize store branding, colors, and theme configuration.', module: 'THEMES', scope: 'TENANT' },

  // TENANT SCOPE — STAFF, ROLES, SETTINGS & AUDIT
  { code: 'staff:read', name: 'View Store Team', description: 'View tenant staff memberships and pending invitations.', module: 'STAFF', scope: 'TENANT' },
  { code: 'staff:invite', name: 'Invite Store Staff', description: 'Send role-scoped staff invitations within hierarchy limits.', module: 'STAFF', scope: 'TENANT' },
  { code: 'role:assign', name: 'Assign & Revoke Store Roles', description: 'Assign or revoke lower-rank roles inside the tenant store.', module: 'STAFF', scope: 'TENANT' },
  { code: 'role:manage', name: 'Customize Store Role Permissions', description: 'Edit permission sets for custom or non-owner tenant roles.', module: 'STAFF', scope: 'TENANT' },
  { code: 'settings:manage', name: 'Manage Store Settings', description: 'Update tenant configuration, currency, and domains.', module: 'SETTINGS', scope: 'TENANT' },
  { code: 'audit:read', name: 'View Store Activity Logs', description: 'Read RBAC and resource audit logs scoped to this tenant.', module: 'AUDIT', scope: 'TENANT' },

  // STOREFRONT SCOPE
  { code: 'storefront:catalog:browse', name: 'Browse Storefront Catalog', description: 'Public storefront product viewing.', module: 'PRODUCTS', scope: 'STOREFRONT' },
  { code: 'storefront:order:create', name: 'Place Storefront Order', description: 'Checkout and create customer-owned orders.', module: 'ORDERS', scope: 'STOREFRONT' },
  { code: 'storefront:order:read:own', name: 'View Own Orders', description: 'Read orders owned by the authenticated customer.', module: 'ORDERS', scope: 'STOREFRONT' },
  { code: 'storefront:order:cancel:own', name: 'Cancel Own Pending Order', description: 'Cancel an unfulfilled order owned by the customer.', module: 'ORDERS', scope: 'STOREFRONT' },
];

export const ALL_TENANT_PERMISSION_CODES = PERMISSIONS_CATALOG
  .filter((p) => p.scope === 'TENANT')
  .map((p) => p.code);

export const ALL_PLATFORM_PERMISSION_CODES = PERMISSIONS_CATALOG
  .filter((p) => p.scope === 'PLATFORM')
  .map((p) => p.code);

export interface RoleDefinition {
  slug: RoleSlug;
  name: string;
  scope: RoleScope;
  hierarchyRank: number;
  description: string;
  permissionCodes: string[];
  isSystemDefault: boolean;
}

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  // 1. PLATFORM ROLES (4)
  {
    slug: 'super_admin',
    name: 'Super Admin',
    scope: 'PLATFORM',
    hierarchyRank: 100,
    description: 'Root platform governance with full control over tenants, platform admins, finance, and security audits.',
    permissionCodes: [...ALL_PLATFORM_PERMISSION_CODES],
    isSystemDefault: true,
  },
  {
    slug: 'platform_admin',
    name: 'Platform Admin',
    scope: 'PLATFORM',
    hierarchyRank: 90,
    description: 'Manages tenants, support escalations, and non-super-admin platform staff.',
    permissionCodes: [
      'platform:tenants:read',
      'platform:tenants:manage',
      'platform:roles:assign',
      'platform:support:manage',
      'platform:audit:read',
    ],
    isSystemDefault: true,
  },
  {
    slug: 'finance_manager',
    name: 'Finance Manager',
    scope: 'PLATFORM',
    hierarchyRank: 70,
    description: 'Governs SaaS subscriptions, settlement payouts, and platform-wide billing reconciliation.',
    permissionCodes: [
      'platform:tenants:read',
      'platform:finance:read',
      'platform:finance:manage',
      'platform:audit:read',
    ],
    isSystemDefault: true,
  },
  {
    slug: 'support_agent',
    name: 'Support Agent',
    scope: 'PLATFORM',
    hierarchyRank: 60,
    description: 'Read-only tenant diagnostics and merchant support operations without billing or role control.',
    permissionCodes: [
      'platform:tenants:read',
      'platform:support:manage',
      'platform:audit:read',
    ],
    isSystemDefault: true,
  },

  // 2. TENANT ROLES (8)
  {
    slug: 'store_owner',
    name: 'Store Owner',
    scope: 'TENANT',
    hierarchyRank: 80,
    description: 'Full sovereignty over a single tenant store, staff memberships, roles, catalog, orders, and billing.',
    permissionCodes: [...ALL_TENANT_PERMISSION_CODES],
    isSystemDefault: true,
  },
  {
    slug: 'store_admin',
    name: 'Store Admin',
    scope: 'TENANT',
    hierarchyRank: 70,
    description: 'Full operational store management and staff delegation below Store Owner.',
    permissionCodes: ALL_TENANT_PERMISSION_CODES.filter((c) => c !== 'settings:manage' || true),
    isSystemDefault: true,
  },
  {
    slug: 'product_manager',
    name: 'Product Manager',
    scope: 'TENANT',
    hierarchyRank: 50,
    description: 'Manages products, variants, categories, and views inventory.',
    permissionCodes: ['product:read', 'product:create', 'product:update:own', 'product:update', 'product:delete', 'inventory:read'],
    isSystemDefault: true,
  },
  {
    slug: 'order_manager',
    name: 'Order Manager',
    scope: 'TENANT',
    hierarchyRank: 50,
    description: 'Processes store orders, fulfillment transitions, and refunds.',
    permissionCodes: ['order:read', 'order:update', 'order:refund', 'customer:read', 'product:read'],
    isSystemDefault: true,
  },
  {
    slug: 'inventory_manager',
    name: 'Inventory Manager',
    scope: 'TENANT',
    hierarchyRank: 50,
    description: 'Controls warehouse stock levels, reservations, and reorder thresholds.',
    permissionCodes: ['inventory:read', 'inventory:update', 'product:read'],
    isSystemDefault: true,
  },
  {
    slug: 'marketing_manager',
    name: 'Marketing Manager',
    scope: 'TENANT',
    hierarchyRank: 50,
    description: 'Runs storefront campaigns, coupons, ads, and theme merchandising.',
    permissionCodes: ['marketing:manage', 'theme:manage', 'product:read', 'customer:read'],
    isSystemDefault: true,
  },
  {
    slug: 'customer_support',
    name: 'Customer Support',
    scope: 'TENANT',
    hierarchyRank: 40,
    description: 'Assists storefront buyers, reviews order statuses, and handles support inquiries.',
    permissionCodes: ['customer:read', 'customer:support', 'order:read', 'product:read'],
    isSystemDefault: true,
  },
  {
    slug: 'store_staff',
    name: 'Store Staff',
    scope: 'TENANT',
    hierarchyRank: 30,
    description: 'Baseline staff operational access with read visibility and own-draft product editing.',
    permissionCodes: ['product:read', 'product:update:own', 'inventory:read', 'order:read', 'customer:read'],
    isSystemDefault: true,
  },

  // 3. STOREFRONT ROLES (2)
  {
    slug: 'customer',
    name: 'Customer',
    scope: 'STOREFRONT',
    hierarchyRank: 10,
    description: 'Authenticated storefront shopper with strict ownership over own orders and profile.',
    permissionCodes: [
      'storefront:catalog:browse',
      'storefront:order:create',
      'storefront:order:read:own',
      'storefront:order:cancel:own',
    ],
    isSystemDefault: true,
  },
  {
    slug: 'guest',
    name: 'Guest',
    scope: 'STOREFRONT',
    hierarchyRank: 0,
    description: 'Unauthenticated visitor restricted to public catalog browsing.',
    permissionCodes: ['storefront:catalog:browse'],
    isSystemDefault: true,
  },
];

export const ROLE_MAP = new Map<string, RoleDefinition>(
  ROLE_DEFINITIONS.map((r) => [r.slug, r])
);

export function mapUserTypeToPlatformRoleSlug(userType: UserType): PlatformRoleSlug | null {
  switch (userType) {
    case 'PLATFORM_SUPER_ADMIN':
      return 'super_admin';
    case 'PLATFORM_ADMIN':
      return 'platform_admin';
    case 'PLATFORM_SUPPORT_AGENT':
      return 'support_agent';
    case 'PLATFORM_FINANCE_MANAGER':
      return 'finance_manager';
    default:
      return null;
  }
}

export function mapPlatformRoleSlugToUserType(slug: string): UserType | null {
  switch (slug.toLowerCase()) {
    case 'super_admin':
      return 'PLATFORM_SUPER_ADMIN';
    case 'platform_admin':
      return 'PLATFORM_ADMIN';
    case 'support_agent':
      return 'PLATFORM_SUPPORT_AGENT';
    case 'finance_manager':
      return 'PLATFORM_FINANCE_MANAGER';
    default:
      return null;
  }
}

export function isPlatformRoleSlug(slug: string): boolean {
  const role = ROLE_MAP.get(slug.toLowerCase());
  return role?.scope === 'PLATFORM';
}

export function isTenantRoleSlug(slug: string): boolean {
  const role = ROLE_MAP.get(slug.toLowerCase());
  return role?.scope === 'TENANT';
}

export function isPlatformPermission(code: string): boolean {
  return code.startsWith('platform:');
}

export function getRoleDefinition(slug: string): RoleDefinition | undefined {
  return ROLE_MAP.get(slug.toLowerCase());
}

export function hasAllPermissions(granted: string[], required: string[]): boolean {
  const set = new Set(granted);
  return required.every((perm) => set.has(perm));
}

export function hasAnyPermission(granted: string[], required: string[]): boolean {
  if (required.length === 0) return true;
  const set = new Set(granted);
  return required.some((perm) => set.has(perm));
}
