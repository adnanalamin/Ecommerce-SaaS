/**
 * NEXORA Phase 10 — Tenant Store Owner Dashboard Service
 *
 * All queries and mutations are strictly scoped by the server-verified
 * `tenantId` from `requireTenantPermission`. Enforces plan quotas,
 * role permission granularity, and records tenant audit logs.
 */

import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors.ts';
import type { AuthenticatedContext } from '../middleware/authenticate.ts';
import type { TenantAuthorizationContext } from '../middleware/authorize.ts';
import { rbacRepository } from '../rbac/rbacRepository.ts';
import { rbacService } from '../rbac/rbacService.ts';
import { getRoleDefinition, ROLE_DEFINITIONS } from '../rbac/permissions.ts';
import {
  onboardingRepository,
  type PlanRecord,
} from '../onboarding/onboardingRepository.ts';
import { platformRepository } from '../platform/platformRepository.ts';
import type { PaymentGateway } from '../db/models.ts';
import {
  ensureTenantDashboardBootstrapped,
  tenantRepository,
  type TenantOrderStatus,
} from './tenantRepository.ts';

export const tenantService = {
  async getMyStores(actor: AuthenticatedContext) {
    await ensureTenantDashboardBootstrapped();
    const memberships = await rbacRepository.listMembershipsByUser(actor.userId);
    const stores: Array<{
      tenantId: string;
      storeId: string;
      name: string;
      slug: string;
      subdomain: string;
      status: string;
      roleSlug: string;
      roleName: string;
      permissions: string[];
      planCode: string;
      currency: string;
    }> = [];

    for (const m of memberships) {
      if (m.status !== 'ACTIVE') continue;
      const tenant = await rbacRepository.findTenantById(m.tenantId);
      if (!tenant) continue;
      const role = await rbacRepository.findTenantRole(m.tenantId, m.roleSlug);
      const roleDef = role || getRoleDefinition(m.roleSlug);
      const bundle = await onboardingRepository.getProvisionedBundle(m.tenantId);
      stores.push({
        tenantId: tenant.id,
        storeId: tenant.storeId,
        name: bundle?.store.name || tenant.name,
        slug: tenant.slug,
        subdomain: tenant.subdomain,
        status: tenant.status,
        roleSlug: m.roleSlug,
        roleName: roleDef?.name || m.roleSlug,
        permissions: roleDef?.permissionCodes || [],
        planCode: bundle?.subscription.planCode || 'STARTER',
        currency: bundle?.store.currency || 'BDT',
      });
    }

    return {
      user: {
        userId: actor.userId,
        email: actor.email,
        fullName: actor.fullName,
        userType: actor.userType,
      },
      stores,
    };
  },

  async getOverview(tenantId: string, tenantAuth: TenantAuthorizationContext) {
    await ensureTenantDashboardBootstrapped();
    const [
      tenant,
      bundle,
      products,
      categories,
      brands,
      orders,
      customers,
      funnel,
      settings,
      branding,
      staffData,
      plans,
    ] = await Promise.all([
      rbacRepository.findTenantById(tenantId),
      onboardingRepository.getProvisionedBundle(tenantId),
      tenantRepository.listProducts(tenantId),
      tenantRepository.listCategories(tenantId),
      tenantRepository.listBrands(tenantId),
      tenantRepository.listOrders(tenantId),
      tenantRepository.listCustomers(tenantId),
      tenantRepository.getFunnelStats(tenantId),
      tenantRepository.getStoreSettings(tenantId),
      tenantRepository.getStoreBranding(tenantId),
      rbacService.listTenantMembershipsAndInvites(tenantId),
      onboardingRepository.listPlans(),
    ]);

    if (!tenant) {
      throw new NotFoundError('Tenant store not found.');
    }

    const activePlan =
      plans.find((p) => p.code === (bundle?.subscription.planCode || 'STARTER')) || plans[0];

    // Real tenant-scoped revenue & order aggregations
    const nonCancelledOrders = orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'REFUNDED');
    const orderRevenueBDT = nonCancelledOrders.reduce((acc, o) => acc + o.totalBDT, 0);
    const refundedOrders = orders.filter((o) => o.status === 'REFUNDED');
    const refundedBDT = refundedOrders.reduce((acc, o) => acc + o.totalBDT, 0);

    // Combine catalog historical sales + active live order ledger
    const catalogUnitsSold = products.reduce((acc, p) => acc + p.unitsSold, 0);
    const catalogHistoricalRevenueBDT = products.reduce((acc, p) => acc + p.unitsSold * p.priceBDT, 0);
    const totalRevenueBDT = catalogHistoricalRevenueBDT + orderRevenueBDT;
    const avgOrderValueBDT =
      nonCancelledOrders.length > 0
        ? Math.round(orderRevenueBDT / nonCancelledOrders.length)
        : products.length > 0
          ? Math.round(totalRevenueBDT / Math.max(1, catalogUnitsSold))
          : 0;

    const orderStatusBreakdown = {
      PENDING: orders.filter((o) => o.status === 'PENDING').length,
      PROCESSING: orders.filter((o) => o.status === 'PROCESSING').length,
      SHIPPED: orders.filter((o) => o.status === 'SHIPPED').length,
      DELIVERED: orders.filter((o) => o.status === 'DELIVERED').length,
      CANCELLED: orders.filter((o) => o.status === 'CANCELLED').length,
      REFUNDED: refundedOrders.length,
    };

    const lowStockProducts = products
      .filter((p) => p.stockQty <= p.lowStockThreshold && p.status !== 'ARCHIVED')
      .sort((a, b) => a.stockQty - b.stockQty)
      .map((p) => ({
        id: p.id,
        sku: p.sku,
        title: p.title,
        stockQty: p.stockQty,
        lowStockThreshold: p.lowStockThreshold,
        priceBDT: p.priceBDT,
      }));

    const catMap = new Map(categories.map((c) => [c.id, c.name]));
    const bestSellingProducts = [...products]
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        sku: p.sku,
        title: p.title,
        categoryName: catMap.get(p.categoryId) || 'Uncategorized',
        unitsSold: p.unitsSold,
        revenueBDT: p.unitsSold * p.priceBDT,
        stockQty: p.stockQty,
        priceBDT: p.priceBDT,
      }));

    const totalCompletedConversions =
      catalogUnitsSold > 0
        ? Math.round(funnel.checkoutInitiated * 0.56) + nonCancelledOrders.length
        : nonCancelledOrders.length;
    const addToCartRatePct =
      funnel.productViews > 0
        ? Number(((funnel.cartAdditions / funnel.productViews) * 100).toFixed(1))
        : 0;
    const checkoutCompletionPct =
      funnel.checkoutInitiated > 0
        ? Number(((totalCompletedConversions / funnel.checkoutInitiated) * 100).toFixed(1))
        : 0;
    const overallConversionPct =
      funnel.storefrontSessions > 0
        ? Number(((totalCompletedConversions / funnel.storefrontSessions) * 100).toFixed(2))
        : 0;
    const returningCustomers = customers.filter((c) => c.ordersCount > 1).length;
    const repeatCustomerRatePct =
      customers.length > 0 ? Number(((returningCustomers / customers.length) * 100).toFixed(1)) : 0;

    // Storage telemetry
    const storageUsedMB = await platformRepository.getStorageUsedForTenant(tenantId);

    const activeMembers = staffData.memberships.filter((m) => m.status === 'ACTIVE');

    return {
      tenant: {
        id: tenant.id,
        name: settings.storeName || tenant.name,
        slug: tenant.slug,
        subdomain: `${tenant.slug}.nexora.shop`,
        customDomain: settings.customDomain,
        status: tenant.status,
        currency: settings.currency,
        timezone: settings.timezone,
      },
      viewer: {
        roleSlug: tenantAuth.roleSlug,
        hierarchyRank: tenantAuth.hierarchyRank,
        permissions: tenantAuth.permissions,
      },
      kpis: {
        totalSalesUnits: catalogUnitsSold + nonCancelledOrders.reduce((acc, o) => acc + o.items.reduce((s, i) => s + i.qty, 0), 0),
        totalOrders: orders.length,
        liveOrderRevenueBDT: orderRevenueBDT,
        totalRevenueBDT,
        refundedBDT,
        avgOrderValueBDT,
        totalCustomers: customers.length,
        vipCustomers: customers.filter((c) => c.segment === 'VIP').length,
        totalProducts: products.length,
        publishedProducts: products.filter((p) => p.status === 'PUBLISHED').length,
        draftProducts: products.filter((p) => p.status === 'DRAFT').length,
        categoriesCount: categories.length,
        brandsCount: brands.length,
        lowStockCount: lowStockProducts.length,
        totalInventoryUnits: products.reduce((acc, p) => acc + p.stockQty, 0),
      },
      orderStatusBreakdown,
      lowStockProducts,
      bestSellingProducts,
      recentOrders: orders.slice(0, 6),
      conversionMetrics: {
        storefrontSessions: funnel.storefrontSessions,
        productViews: funnel.productViews,
        cartAdditions: funnel.cartAdditions,
        checkoutInitiated: funnel.checkoutInitiated,
        completedOrders: totalCompletedConversions,
        addToCartRatePct,
        checkoutCompletionPct,
        overallConversionPct,
        repeatCustomerRatePct,
        dailySeries: funnel.dailySeries,
      },
      subscription: {
        planCode: bundle?.subscription.planCode || 'STARTER',
        planName: activePlan?.name || 'Starter Free',
        status: bundle?.subscription.status || 'ACTIVE',
        billingCycle: bundle?.subscription.billingCycle || 'MONTHLY',
        currentPeriodEnd: bundle?.subscription.currentPeriodEnd || new Date(Date.now() + 30 * 86_400_000),
        transactionFeePercent: activePlan?.transactionFeePercent ?? 2,
        quotas: {
          productsUsed: products.length,
          maxProducts: activePlan?.maxProducts ?? 50,
          staffUsed: activeMembers.length,
          maxStaffUsers: activePlan?.maxStaffUsers ?? 2,
          storageUsedMB,
          maxStorageMB: activePlan?.maxStorageMB ?? 1024,
        },
      },
      brandingPreview: {
        themeCode: branding.themeCode,
        primaryColor: branding.primaryColor,
        accentColor: branding.accentColor,
      },
    };
  },

  // ---------------- ANALYTICS ----------------
  async getAnalytics(tenantId: string) {
    await ensureTenantDashboardBootstrapped();
    const [products, categories, orders, customers, funnel, discounts, coupons] = await Promise.all([
      tenantRepository.listProducts(tenantId),
      tenantRepository.listCategories(tenantId),
      tenantRepository.listOrders(tenantId),
      tenantRepository.listCustomers(tenantId),
      tenantRepository.getFunnelStats(tenantId),
      tenantRepository.listDiscounts(tenantId),
      tenantRepository.listCoupons(tenantId),
    ]);

    const catNameMap = new Map(categories.map((c) => [c.id, c.name]));
    const categorySalesMap = new Map<string, { categoryName: string; unitsSold: number; revenueBDT: number }>();
    for (const p of products) {
      const cname = catNameMap.get(p.categoryId) || 'Other';
      const cur = categorySalesMap.get(cname) || { categoryName: cname, unitsSold: 0, revenueBDT: 0 };
      cur.unitsSold += p.unitsSold;
      cur.revenueBDT += p.unitsSold * p.priceBDT;
      categorySalesMap.set(cname, cur);
    }

    const gatewayCounts = new Map<string, { gateway: string; ordersCount: number; revenueBDT: number }>();
    for (const o of orders) {
      const cur = gatewayCounts.get(o.paymentGateway) || { gateway: o.paymentGateway, ordersCount: 0, revenueBDT: 0 };
      cur.ordersCount += 1;
      cur.revenueBDT += o.totalBDT;
      gatewayCounts.set(o.paymentGateway, cur);
    }

    const grossCatalogRev = products.reduce((s, p) => s + p.unitsSold * p.priceBDT, 0);
    const totalCost = products.reduce((s, p) => s + p.unitsSold * p.costBDT, 0);
    const grossMarginPct =
      grossCatalogRev > 0 ? Number((((grossCatalogRev - totalCost) / grossCatalogRev) * 100).toFixed(1)) : 0;

    return {
      dailySeries: funnel.dailySeries,
      funnel: {
        sessions: funnel.storefrontSessions,
        productViews: funnel.productViews,
        cartAdditions: funnel.cartAdditions,
        checkoutInitiated: funnel.checkoutInitiated,
        completedOrders: Math.round(funnel.checkoutInitiated * 0.56) + orders.length,
      },
      categoryBreakdown: Array.from(categorySalesMap.values()).sort((a, b) => b.revenueBDT - a.revenueBDT),
      paymentGatewayShare: Array.from(gatewayCounts.values()).sort((a, b) => b.revenueBDT - a.revenueBDT),
      unitEconomics: {
        grossRevenueBDT: grossCatalogRev + orders.reduce((s, o) => s + o.totalBDT, 0),
        estimatedCostBDT: totalCost,
        grossMarginPct,
        totalCustomerLTV: customers.reduce((s, c) => s + c.totalSpentBDT, 0),
        activeCampaignImpactBDT: discounts.reduce((s, d) => s + d.revenueImpactBDT, 0),
        couponRedemptions: coupons.reduce((s, c) => s + c.usedCount, 0),
      },
    };
  },

  // ---------------- CATALOG: PRODUCTS, CATEGORIES, BRANDS, INVENTORY ----------------
  async listCatalogBundle(tenantId: string) {
    await ensureTenantDashboardBootstrapped();
    const [products, categories, brands, inventoryLogs] = await Promise.all([
      tenantRepository.listProducts(tenantId),
      tenantRepository.listCategories(tenantId),
      tenantRepository.listBrands(tenantId),
      tenantRepository.listInventoryLogs(tenantId),
    ]);
    const catMap = new Map(categories.map((c) => [c.id, c.name]));
    const brandMap = new Map(brands.map((b) => [b.id, b.name]));

    return {
      products: products.map((p) => ({
        ...p,
        categoryName: catMap.get(p.categoryId) || 'Uncategorized',
        brandName: brandMap.get(p.brandId) || 'House Brand',
      })),
      categories: categories.map((c) => ({
        ...c,
        productCount: products.filter((p) => p.categoryId === c.id).length,
      })),
      brands: brands.map((b) => ({
        ...b,
        productCount: products.filter((p) => p.brandId === b.id).length,
      })),
      inventoryLogs,
    };
  },

  async createProduct(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    input: {
      title: string;
      sku: string;
      categoryId: string;
      brandId: string;
      priceBDT: number;
      compareAtPriceBDT?: number;
      costBDT: number;
      stockQty: number;
      lowStockThreshold: number;
      status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    };
    ipAddress: string;
  }) {
    const [existingProducts, bundle, plans] = await Promise.all([
      tenantRepository.listProducts(params.tenantAuth.tenantId),
      onboardingRepository.getProvisionedBundle(params.tenantAuth.tenantId),
      onboardingRepository.listPlans(),
    ]);
    const activePlan = plans.find((p) => p.code === (bundle?.subscription.planCode || 'STARTER'));
    if (activePlan && existingProducts.length >= activePlan.maxProducts) {
      throw new ForbiddenError(
        `Plan product limit reached (${existingProducts.length}/${activePlan.maxProducts} on ${activePlan.name}). Upgrade subscription to add more products.`,
        'PLAN_QUOTA_EXCEEDED'
      );
    }

    const created = await tenantRepository.createProduct(params.tenantAuth.tenantId, {
      ...params.input,
      createdByUserId: params.actor.userId,
    });
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'RESOURCE_CREATED',
      resourceType: 'Product',
      resourceId: created.id,
      outcome: 'ALLOWED',
      reason: `Created product ${created.sku} (${created.title}).`,
      ipAddress: params.ipAddress,
    });
    return created;
  },

  async updateProduct(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    productId: string;
    patch: {
      title?: string;
      categoryId?: string;
      brandId?: string;
      priceBDT?: number;
      compareAtPriceBDT?: number;
      costBDT?: number;
      lowStockThreshold?: number;
      status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    };
    ipAddress: string;
  }) {
    const existing = await tenantRepository.findProduct(params.tenantAuth.tenantId, params.productId);
    const canUpdateAny = params.tenantAuth.permissions.includes('product:update');
    const canUpdateOwn = params.tenantAuth.permissions.includes('product:update:own');
    if (!canUpdateAny && !(canUpdateOwn && existing.createdByUserId === params.actor.userId)) {
      throw new ForbiddenError('You may only edit products you created.', 'RESOURCE_OWNERSHIP_DENIED');
    }

    const updated = await tenantRepository.updateProduct(
      params.tenantAuth.tenantId,
      params.productId,
      params.patch
    );
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'RESOURCE_UPDATED',
      resourceType: 'Product',
      resourceId: updated.id,
      outcome: 'ALLOWED',
      reason: `Updated product ${updated.sku}.`,
      ipAddress: params.ipAddress,
    });
    return updated;
  },

  async deleteProduct(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    productId: string;
    ipAddress: string;
  }) {
    const existing = await tenantRepository.findProduct(params.tenantAuth.tenantId, params.productId);
    await tenantRepository.deleteProduct(params.tenantAuth.tenantId, params.productId);
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'RESOURCE_DELETED',
      resourceType: 'Product',
      resourceId: params.productId,
      outcome: 'ALLOWED',
      reason: `Deleted product ${existing.sku}.`,
      ipAddress: params.ipAddress,
    });
    return { deleted: true, productId: params.productId };
  },

  async adjustInventory(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    productId: string;
    newQty: number;
    lowStockThreshold?: number;
    reason: string;
    ipAddress: string;
  }) {
    const result = await tenantRepository.adjustInventory(params.tenantAuth.tenantId, params.productId, {
      newQty: params.newQty,
      lowStockThreshold: params.lowStockThreshold,
      reason: params.reason,
      actorEmail: params.actor.email,
    });
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'INVENTORY_ADJUSTED',
      resourceType: 'Inventory',
      resourceId: params.productId,
      outcome: 'ALLOWED',
      reason: `Adjusted ${result.product.sku} stock from ${result.log.previousQty} to ${result.log.newQty} (${params.reason}).`,
      ipAddress: params.ipAddress,
    });
    return result;
  },

  async createCategory(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    input: { name: string; description: string; sortOrder?: number; isActive?: boolean };
    ipAddress: string;
  }) {
    const created = await tenantRepository.createCategory(params.tenantAuth.tenantId, params.input);
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'RESOURCE_CREATED',
      resourceType: 'Category',
      resourceId: created.id,
      outcome: 'ALLOWED',
      reason: `Created category ${created.name}.`,
      ipAddress: params.ipAddress,
    });
    return created;
  },

  async updateCategory(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    categoryId: string;
    patch: { name?: string; description?: string; sortOrder?: number; isActive?: boolean };
    ipAddress: string;
  }) {
    const updated = await tenantRepository.updateCategory(
      params.tenantAuth.tenantId,
      params.categoryId,
      params.patch
    );
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'RESOURCE_UPDATED',
      resourceType: 'Category',
      resourceId: updated.id,
      outcome: 'ALLOWED',
      reason: `Updated category ${updated.name}.`,
      ipAddress: params.ipAddress,
    });
    return updated;
  },

  async deleteCategory(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    categoryId: string;
    ipAddress: string;
  }) {
    await tenantRepository.deleteCategory(params.tenantAuth.tenantId, params.categoryId);
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'RESOURCE_DELETED',
      resourceType: 'Category',
      resourceId: params.categoryId,
      outcome: 'ALLOWED',
      reason: `Deleted category ${params.categoryId}.`,
      ipAddress: params.ipAddress,
    });
    return { deleted: true, categoryId: params.categoryId };
  },

  async createBrand(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    input: { name: string; originCountry: string; websiteUrl: string; isFeatured?: boolean; isActive?: boolean };
    ipAddress: string;
  }) {
    const created = await tenantRepository.createBrand(params.tenantAuth.tenantId, params.input);
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'RESOURCE_CREATED',
      resourceType: 'Brand',
      resourceId: created.id,
      outcome: 'ALLOWED',
      reason: `Created brand ${created.name}.`,
      ipAddress: params.ipAddress,
    });
    return created;
  },

  async updateBrand(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    brandId: string;
    patch: { name?: string; originCountry?: string; websiteUrl?: string; isFeatured?: boolean; isActive?: boolean };
    ipAddress: string;
  }) {
    const updated = await tenantRepository.updateBrand(
      params.tenantAuth.tenantId,
      params.brandId,
      params.patch
    );
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'RESOURCE_UPDATED',
      resourceType: 'Brand',
      resourceId: updated.id,
      outcome: 'ALLOWED',
      reason: `Updated brand ${updated.name}.`,
      ipAddress: params.ipAddress,
    });
    return updated;
  },

  async deleteBrand(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    brandId: string;
    ipAddress: string;
  }) {
    await tenantRepository.deleteBrand(params.tenantAuth.tenantId, params.brandId);
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'RESOURCE_DELETED',
      resourceType: 'Brand',
      resourceId: params.brandId,
      outcome: 'ALLOWED',
      reason: `Deleted brand ${params.brandId}.`,
      ipAddress: params.ipAddress,
    });
    return { deleted: true, brandId: params.brandId };
  },

  // ---------------- ORDERS & CUSTOMERS ----------------
  async listOrders(tenantId: string, filters?: { status?: string; search?: string }) {
    const all = await tenantRepository.listOrders(tenantId);
    const q = (filters?.search || '').trim().toLowerCase();
    return all.filter((o) => {
      if (filters?.status && filters.status !== 'ALL' && o.status !== filters.status) return false;
      if (q) {
        return (
          o.orderNumber.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.customerEmail.toLowerCase().includes(q)
        );
      }
      return true;
    });
  },

  async updateOrderStatus(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    orderId: string;
    status: TenantOrderStatus;
    ipAddress: string;
  }) {
    if (params.status === 'REFUNDED' && !params.tenantAuth.permissions.includes('order:refund')) {
      throw new ForbiddenError('Issuing order refunds requires order:refund permission.', 'INSUFFICIENT_TENANT_PERMISSION');
    }
    const updated = await tenantRepository.updateOrderStatus(
      params.tenantAuth.tenantId,
      params.orderId,
      params.status
    );
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'RESOURCE_UPDATED',
      resourceType: 'Order',
      resourceId: updated.id,
      outcome: 'ALLOWED',
      reason: `Updated order ${updated.orderNumber} status to ${updated.status}.`,
      ipAddress: params.ipAddress,
    });
    return updated;
  },

  async listCustomers(tenantId: string, filters?: { segment?: string; search?: string }) {
    const all = await tenantRepository.listCustomers(tenantId);
    const q = (filters?.search || '').trim().toLowerCase();
    return all.filter((c) => {
      if (filters?.segment && filters.segment !== 'ALL' && c.segment !== filters.segment) return false;
      if (q) {
        return (
          c.fullName.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.city.toLowerCase().includes(q)
        );
      }
      return true;
    });
  },

  async updateCustomer(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    customerId: string;
    patch: { segment?: 'VIP' | 'RETURNING' | 'NEW' | 'AT_RISK'; notes?: string; status?: 'ACTIVE' | 'BLOCKED' };
    ipAddress: string;
  }) {
    const updated = await tenantRepository.updateCustomer(
      params.tenantAuth.tenantId,
      params.customerId,
      params.patch
    );
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'RESOURCE_UPDATED',
      resourceType: 'Customer',
      resourceId: updated.id,
      outcome: 'ALLOWED',
      reason: `Updated customer ${updated.email} (${Object.keys(params.patch).join(', ')}).`,
      ipAddress: params.ipAddress,
    });
    return updated;
  },

  // ---------------- COUPONS & DISCOUNTS ----------------
  async listCoupons(tenantId: string) {
    return tenantRepository.listCoupons(tenantId);
  },

  async createCoupon(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    input: {
      code: string;
      title: string;
      discountType: 'PERCENTAGE' | 'FIXED_BDT' | 'FREE_SHIPPING';
      discountValue: number;
      minOrderBDT: number;
      maxDiscountBDT?: number;
      usageLimit: number;
      daysValid?: number;
    };
    ipAddress: string;
  }) {
    const created = await tenantRepository.createCoupon(params.tenantAuth.tenantId, params.input);
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'COUPON_UPDATED',
      resourceType: 'Coupon',
      resourceId: created.id,
      outcome: 'ALLOWED',
      reason: `Created coupon ${created.code}.`,
      ipAddress: params.ipAddress,
    });
    return created;
  },

  async updateCoupon(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    couponId: string;
    patch: { title?: string; discountValue?: number; minOrderBDT?: number; usageLimit?: number; isActive?: boolean };
    ipAddress: string;
  }) {
    const updated = await tenantRepository.updateCoupon(
      params.tenantAuth.tenantId,
      params.couponId,
      params.patch
    );
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'COUPON_UPDATED',
      resourceType: 'Coupon',
      resourceId: updated.id,
      outcome: 'ALLOWED',
      reason: `Updated coupon ${updated.code}.`,
      ipAddress: params.ipAddress,
    });
    return updated;
  },

  async deleteCoupon(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    couponId: string;
    ipAddress: string;
  }) {
    await tenantRepository.deleteCoupon(params.tenantAuth.tenantId, params.couponId);
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'RESOURCE_DELETED',
      resourceType: 'Coupon',
      resourceId: params.couponId,
      outcome: 'ALLOWED',
      reason: `Deleted coupon ${params.couponId}.`,
      ipAddress: params.ipAddress,
    });
    return { deleted: true, couponId: params.couponId };
  },

  async listDiscounts(tenantId: string) {
    return tenantRepository.listDiscounts(tenantId);
  },

  async createDiscount(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    input: {
      name: string;
      campaignType: 'FLASH_SALE' | 'BULK_TIER' | 'CATEGORY_OFFER' | 'FIRST_ORDER';
      discountType: 'PERCENTAGE' | 'FIXED_BDT';
      discountValue: number;
      targetCategoryId?: string;
      minQty: number;
      stackable: boolean;
      daysValid?: number;
    };
    ipAddress: string;
  }) {
    const created = await tenantRepository.createDiscount(params.tenantAuth.tenantId, params.input);
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'DISCOUNT_UPDATED',
      resourceType: 'Discount',
      resourceId: created.id,
      outcome: 'ALLOWED',
      reason: `Created automatic discount "${created.name}".`,
      ipAddress: params.ipAddress,
    });
    return created;
  },

  async updateDiscount(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    discountId: string;
    patch: { name?: string; discountValue?: number; minQty?: number; stackable?: boolean; isActive?: boolean };
    ipAddress: string;
  }) {
    const updated = await tenantRepository.updateDiscount(
      params.tenantAuth.tenantId,
      params.discountId,
      params.patch
    );
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'DISCOUNT_UPDATED',
      resourceType: 'Discount',
      resourceId: updated.id,
      outcome: 'ALLOWED',
      reason: `Updated automatic discount "${updated.name}".`,
      ipAddress: params.ipAddress,
    });
    return updated;
  },

  async deleteDiscount(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    discountId: string;
    ipAddress: string;
  }) {
    await tenantRepository.deleteDiscount(params.tenantAuth.tenantId, params.discountId);
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'RESOURCE_DELETED',
      resourceType: 'Discount',
      resourceId: params.discountId,
      outcome: 'ALLOWED',
      reason: `Deleted discount ${params.discountId}.`,
      ipAddress: params.ipAddress,
    });
    return { deleted: true, discountId: params.discountId };
  },

  // ---------------- SETTINGS, BRANDING, PAYMENTS, SHIPPING ----------------
  async getStoreSettings(tenantId: string) {
    return tenantRepository.getStoreSettings(tenantId);
  },

  async updateStoreSettings(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    patch: Record<string, any>;
    ipAddress: string;
  }) {
    const updated = await tenantRepository.updateStoreSettings(params.tenantAuth.tenantId, params.patch);
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'STORE_SETTINGS_UPDATED',
      resourceType: 'StoreSettings',
      resourceId: params.tenantAuth.tenantId,
      outcome: 'ALLOWED',
      reason: `Updated store settings (${Object.keys(params.patch).join(', ')}).`,
      ipAddress: params.ipAddress,
    });
    return updated;
  },

  async getStoreBranding(tenantId: string) {
    return tenantRepository.getStoreBranding(tenantId);
  },

  async updateStoreBranding(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    patch: Record<string, any>;
    ipAddress: string;
  }) {
    const updated = await tenantRepository.updateStoreBranding(params.tenantAuth.tenantId, params.patch);
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'STORE_BRANDING_UPDATED',
      resourceType: 'StoreBranding',
      resourceId: params.tenantAuth.tenantId,
      outcome: 'ALLOWED',
      reason: `Updated store branding theme (${updated.themeCode}).`,
      ipAddress: params.ipAddress,
    });
    return updated;
  },

  async listPaymentSettings(tenantId: string) {
    return tenantRepository.listPaymentConfigs(tenantId);
  },

  async updatePaymentSetting(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    gateway: PaymentGateway;
    patch: {
      isEnabled?: boolean;
      mode?: 'SANDBOX' | 'LIVE';
      merchantAccountInput?: string;
      apiSecretProvided?: boolean;
    };
    ipAddress: string;
  }) {
    const updated = await tenantRepository.updatePaymentConfig(
      params.tenantAuth.tenantId,
      params.gateway,
      params.patch
    );
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'PAYMENT_SETTINGS_UPDATED',
      resourceType: 'PaymentGateway',
      resourceId: params.gateway,
      outcome: 'ALLOWED',
      reason: `Updated ${params.gateway} (${updated.isEnabled ? 'Enabled' : 'Disabled'}, ${updated.mode}).`,
      ipAddress: params.ipAddress,
    });
    return updated;
  },

  async listShippingMethods(tenantId: string) {
    return tenantRepository.listShippingMethods(tenantId);
  },

  async createShippingMethod(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    input: {
      code: string;
      name: string;
      zoneName: string;
      carrier: string;
      baseRateBDT: number;
      freeShippingThresholdBDT: number;
      estimatedDays: string;
      codSupported: boolean;
    };
    ipAddress: string;
  }) {
    const created = await tenantRepository.createShippingMethod(params.tenantAuth.tenantId, params.input);
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'SHIPPING_SETTINGS_UPDATED',
      resourceType: 'ShippingMethod',
      resourceId: created.id,
      outcome: 'ALLOWED',
      reason: `Created shipping method ${created.code} (${created.name}).`,
      ipAddress: params.ipAddress,
    });
    return created;
  },

  async updateShippingMethod(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    methodId: string;
    patch: Record<string, any>;
    ipAddress: string;
  }) {
    const updated = await tenantRepository.updateShippingMethod(
      params.tenantAuth.tenantId,
      params.methodId,
      params.patch
    );
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'SHIPPING_SETTINGS_UPDATED',
      resourceType: 'ShippingMethod',
      resourceId: updated.id,
      outcome: 'ALLOWED',
      reason: `Updated shipping method ${updated.code}.`,
      ipAddress: params.ipAddress,
    });
    return updated;
  },

  async deleteShippingMethod(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    methodId: string;
    ipAddress: string;
  }) {
    await tenantRepository.deleteShippingMethod(params.tenantAuth.tenantId, params.methodId);
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'SHIPPING_SETTINGS_UPDATED',
      resourceType: 'ShippingMethod',
      resourceId: params.methodId,
      outcome: 'ALLOWED',
      reason: `Deleted shipping method ${params.methodId}.`,
      ipAddress: params.ipAddress,
    });
    return { deleted: true, methodId: params.methodId };
  },

  // ---------------- STAFF MANAGEMENT (REUSES RBAC SERVICE) ----------------
  async getStaffBundle(tenantId: string) {
    const [{ memberships, invitations }, roles] = await Promise.all([
      rbacService.listTenantMembershipsAndInvites(tenantId),
      rbacService.listTenantRoles(tenantId),
    ]);
    const assignableRoles =
      roles.length > 0
        ? roles.filter((r) => r.slug !== 'store_owner')
        : ROLE_DEFINITIONS.filter((r) => r.scope === 'TENANT' && r.slug !== 'store_owner');
    return { memberships, invitations, assignableRoles };
  },

  async inviteStaff(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    email: string;
    roleSlug: string;
    ipAddress: string;
  }) {
    const [{ memberships }, bundle, plans] = await Promise.all([
      rbacService.listTenantMembershipsAndInvites(params.tenantAuth.tenantId),
      onboardingRepository.getProvisionedBundle(params.tenantAuth.tenantId),
      onboardingRepository.listPlans(),
    ]);
    const activeMembers = memberships.filter((m) => m.status === 'ACTIVE');
    const activePlan = plans.find((p) => p.code === (bundle?.subscription.planCode || 'STARTER'));
    if (activePlan && activeMembers.length >= activePlan.maxStaffUsers) {
      throw new ForbiddenError(
        `Staff seat quota reached (${activeMembers.length}/${activePlan.maxStaffUsers} on ${activePlan.name}). Upgrade plan to invite more staff.`,
        'PLAN_QUOTA_EXCEEDED'
      );
    }
    return rbacService.inviteStaff(params);
  },

  // ---------------- SUBSCRIPTION MANAGEMENT ----------------
  async getSubscriptionDetails(tenantId: string) {
    await ensureTenantDashboardBootstrapped();
    const [bundle, plans, products, staffData, storageUsedMB] = await Promise.all([
      onboardingRepository.getProvisionedBundle(tenantId),
      onboardingRepository.listPlans(),
      tenantRepository.listProducts(tenantId),
      rbacService.listTenantMembershipsAndInvites(tenantId),
      platformRepository.getStorageUsedForTenant(tenantId),
    ]);
    if (!bundle) {
      throw new NotFoundError('Subscription bundle not found for this store.');
    }
    const activePlan = plans.find((p) => p.code === bundle.subscription.planCode) || plans[0];

    return {
      subscription: bundle.subscription,
      currentPlan: activePlan,
      availablePlans: plans.filter((p) => p.isActive !== false),
      usage: {
        productsUsed: products.length,
        maxProducts: activePlan.maxProducts,
        staffUsed: staffData.memberships.filter((m) => m.status === 'ACTIVE').length,
        maxStaffUsers: activePlan.maxStaffUsers,
        storageUsedMB,
        maxStorageMB: activePlan.maxStorageMB,
      },
    };
  },

  async updateSubscription(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    planCode?: PlanRecord['code'];
    billingCycle?: 'MONTHLY' | 'YEARLY';
    cancelAutoRenew?: boolean;
    ipAddress: string;
  }) {
    const plans = await onboardingRepository.listPlans();
    if (params.planCode) {
      const targetPlan = plans.find((p) => p.code === params.planCode);
      if (!targetPlan || targetPlan.isActive === false) {
        throw new BadRequestError('Selected subscription plan is unavailable.');
      }
      const [products, staffData] = await Promise.all([
        tenantRepository.listProducts(params.tenantAuth.tenantId),
        rbacService.listTenantMembershipsAndInvites(params.tenantAuth.tenantId),
      ]);
      const activeStaff = staffData.memberships.filter((m) => m.status === 'ACTIVE').length;
      if (products.length > targetPlan.maxProducts) {
        throw new BadRequestError(
          `Cannot downgrade to ${targetPlan.name}: store currently has ${products.length} products (plan limit ${targetPlan.maxProducts}).`
        );
      }
      if (activeStaff > targetPlan.maxStaffUsers) {
        throw new BadRequestError(
          `Cannot downgrade to ${targetPlan.name}: store currently has ${activeStaff} active staff (plan limit ${targetPlan.maxStaffUsers}).`
        );
      }
    }

    const updated = await onboardingRepository.updateTenantSubscriptionRecord(params.tenantAuth.tenantId, {
      planCode: params.planCode,
      billingCycle: params.billingCycle,
      status: params.cancelAutoRenew ? 'CANCELLED' : 'ACTIVE',
    });
    if (!updated) {
      throw new NotFoundError('Tenant subscription record not found.');
    }

    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'TENANT_SUBSCRIPTION_UPDATED',
      resourceType: 'Subscription',
      resourceId: updated.id,
      outcome: 'ALLOWED',
      reason: `Store subscription updated to ${updated.planCode} (${updated.billingCycle}, ${updated.status}).`,
      ipAddress: params.ipAddress,
    });

    return this.getSubscriptionDetails(params.tenantAuth.tenantId);
  },
};
