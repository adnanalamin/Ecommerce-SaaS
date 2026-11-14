/**
 * NEXORA Phase 10 — Tenant Store Owner Dashboard Types
 */

export type TenantApiCallFn = (
  path: string,
  init?: RequestInit
) => Promise<{ res: Response; json: any }>;

export interface TenantConfirmConfig {
  title: string;
  description: string;
  confirmLabel: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => Promise<void>;
}

export interface MyStoreSummary {
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
}

export interface TenantOverviewData {
  tenant: {
    id: string;
    name: string;
    slug: string;
    subdomain: string;
    customDomain: string;
    status: string;
    currency: string;
    timezone: string;
  };
  viewer: {
    roleSlug: string;
    hierarchyRank: number;
    permissions: string[];
  };
  kpis: {
    totalSalesUnits: number;
    totalOrders: number;
    liveOrderRevenueBDT: number;
    totalRevenueBDT: number;
    refundedBDT: number;
    avgOrderValueBDT: number;
    totalCustomers: number;
    vipCustomers: number;
    totalProducts: number;
    publishedProducts: number;
    draftProducts: number;
    categoriesCount: number;
    brandsCount: number;
    lowStockCount: number;
    totalInventoryUnits: number;
  };
  orderStatusBreakdown: Record<
    'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED',
    number
  >;
  lowStockProducts: Array<{
    id: string;
    sku: string;
    title: string;
    stockQty: number;
    lowStockThreshold: number;
    priceBDT: number;
  }>;
  bestSellingProducts: Array<{
    id: string;
    sku: string;
    title: string;
    categoryName: string;
    unitsSold: number;
    revenueBDT: number;
    stockQty: number;
    priceBDT: number;
  }>;
  recentOrders: TenantOrderItem[];
  conversionMetrics: {
    storefrontSessions: number;
    productViews: number;
    cartAdditions: number;
    checkoutInitiated: number;
    completedOrders: number;
    addToCartRatePct: number;
    checkoutCompletionPct: number;
    overallConversionPct: number;
    repeatCustomerRatePct: number;
    dailySeries: Array<{
      dateLabel: string;
      sessions: number;
      orders: number;
      revenueBDT: number;
    }>;
  };
  subscription: {
    planCode: string;
    planName: string;
    status: string;
    billingCycle: 'MONTHLY' | 'YEARLY';
    currentPeriodEnd: string;
    transactionFeePercent: number;
    quotas: {
      productsUsed: number;
      maxProducts: number;
      staffUsed: number;
      maxStaffUsers: number;
      storageUsedMB: number;
      maxStorageMB: number;
    };
  };
  brandingPreview: {
    themeCode: string;
    primaryColor: string;
    accentColor: string;
  };
}

export interface TenantProductItem {
  id: string;
  tenantId: string;
  title: string;
  sku: string;
  slug: string;
  categoryId: string;
  categoryName?: string;
  brandId: string;
  brandName?: string;
  priceBDT: number;
  compareAtPriceBDT?: number;
  costBDT: number;
  stockQty: number;
  lowStockThreshold: number;
  unitsSold: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  createdByUserId: string;
  updatedAt: string;
}

export interface TenantCategoryItem {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  productCount?: number;
  updatedAt: string;
}

export interface TenantBrandItem {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  originCountry: string;
  websiteUrl: string;
  isFeatured: boolean;
  isActive: boolean;
  productCount?: number;
  updatedAt: string;
}

export interface TenantInventoryLogItem {
  id: string;
  tenantId: string;
  productId: string;
  sku: string;
  productTitle: string;
  previousQty: number;
  deltaQty: number;
  newQty: number;
  reason: string;
  actorEmail: string;
  createdAt: string;
}

export interface TenantOrderItem {
  id: string;
  tenantId: string;
  orderNumber: string;
  customerId: string;
  customerUserId: string;
  customerName: string;
  customerEmail: string;
  itemsSummary: string;
  subtotalBDT: number;
  discountBDT: number;
  shippingBDT: number;
  totalBDT: number;
  paymentGateway: string;
  paymentStatus: 'PENDING' | 'PAID' | 'REFUNDED';
  status: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';
  shippingCity: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantCustomerItem {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  segment: 'VIP' | 'RETURNING' | 'NEW' | 'AT_RISK';
  ordersCount: number;
  totalSpentBDT: number;
  notes: string;
  status: 'ACTIVE' | 'BLOCKED';
  lastOrderAt?: string;
}

export interface TenantCouponItem {
  id: string;
  tenantId: string;
  code: string;
  title: string;
  discountType: 'PERCENTAGE' | 'FIXED_BDT' | 'FREE_SHIPPING';
  discountValue: number;
  minOrderBDT: number;
  maxDiscountBDT?: number;
  usageLimit: number;
  usedCount: number;
  endsAt: string;
  isActive: boolean;
}

export interface TenantDiscountItem {
  id: string;
  tenantId: string;
  name: string;
  campaignType: 'FLASH_SALE' | 'BULK_TIER' | 'CATEGORY_OFFER' | 'FIRST_ORDER';
  discountType: 'PERCENTAGE' | 'FIXED_BDT';
  discountValue: number;
  targetCategoryId?: string;
  minQty: number;
  stackable: boolean;
  isActive: boolean;
  endsAt: string;
  redemptionsCount: number;
  revenueImpactBDT: number;
}
