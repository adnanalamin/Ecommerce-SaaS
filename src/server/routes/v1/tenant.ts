/**
 * NEXORA Phase 10 — Tenant Store Owner Dashboard Routes (/api/v1/tenant)
 *
 * Every endpoint enforces `requireAuth` and `requireTenantPermission`
 * which resolves `req.tenantAuth.tenantId` from verified server membership.
 * Client-supplied tenantId inside bodies is strictly rejected/ignored.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateRequest } from '../../middleware/validateRequest.ts';
import { requireAuth } from '../../middleware/authenticate.ts';
import { requireTenantPermission } from '../../middleware/authorize.ts';
import { rbacService } from '../../rbac/rbacService.ts';
import { tenantService } from '../../tenant/tenantService.ts';
import { sendSuccess } from '../../utils/apiResponse.ts';
import { runTenantVerificationSuite } from '../../tenant/testTenant.ts';

export const tenantRouter = Router();

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim().slice(0, 64);
  return (req.ip || req.socket.remoteAddress || '127.0.0.1').slice(0, 64);
}

function qStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v.trim() : undefined;
}

// ==========================================
// ZOD VALIDATION SCHEMAS (.strict())
// ==========================================
const CreateProductSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    sku: z.string().trim().min(2).max(40),
    categoryId: z.string().trim().min(2).max(80),
    brandId: z.string().trim().min(2).max(80),
    priceBDT: z.number().positive().max(10_000_000),
    compareAtPriceBDT: z.number().positive().max(10_000_000).optional(),
    costBDT: z.number().min(0).max(10_000_000),
    stockQty: z.number().int().min(0).max(1_000_000),
    lowStockThreshold: z.number().int().min(0).max(10_000).default(10),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('PUBLISHED'),
  })
  .strict();

const UpdateProductSchema = z
  .object({
    title: z.string().trim().min(2).max(160).optional(),
    categoryId: z.string().trim().min(2).max(80).optional(),
    brandId: z.string().trim().min(2).max(80).optional(),
    priceBDT: z.number().positive().max(10_000_000).optional(),
    compareAtPriceBDT: z.number().positive().max(10_000_000).optional(),
    costBDT: z.number().min(0).max(10_000_000).optional(),
    lowStockThreshold: z.number().int().min(0).max(10_000).optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  })
  .strict();

const AdjustInventorySchema = z
  .object({
    newQty: z.number().int().min(0).max(1_000_000),
    lowStockThreshold: z.number().int().min(0).max(10_000).optional(),
    reason: z.string().trim().min(3).max(200),
  })
  .strict();

const CreateCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().min(2).max(300),
    sortOrder: z.number().int().min(0).max(999).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const UpdateCategorySchema = CreateCategorySchema.partial().strict();

const CreateBrandSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    originCountry: z.string().trim().min(2).max(80),
    websiteUrl: z.string().trim().min(3).max(200),
    isFeatured: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const UpdateBrandSchema = CreateBrandSchema.partial().strict();

const UpdateOrderStatusSchema = z
  .object({
    status: z.enum(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']),
  })
  .strict();

const UpdateCustomerSchema = z
  .object({
    segment: z.enum(['VIP', 'RETURNING', 'NEW', 'AT_RISK']).optional(),
    notes: z.string().trim().max(400).optional(),
    status: z.enum(['ACTIVE', 'BLOCKED']).optional(),
  })
  .strict();

const CreateCouponSchema = z
  .object({
    code: z.string().trim().min(3).max(32),
    title: z.string().trim().min(3).max(120),
    discountType: z.enum(['PERCENTAGE', 'FIXED_BDT', 'FREE_SHIPPING']),
    discountValue: z.number().min(0).max(1_000_000),
    minOrderBDT: z.number().min(0).max(1_000_000),
    maxDiscountBDT: z.number().positive().max(1_000_000).optional(),
    usageLimit: z.number().int().min(1).max(1_000_000),
    daysValid: z.number().int().min(1).max(365).optional(),
  })
  .strict();

const UpdateCouponSchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    discountValue: z.number().min(0).max(1_000_000).optional(),
    minOrderBDT: z.number().min(0).max(1_000_000).optional(),
    usageLimit: z.number().int().min(1).max(1_000_000).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const CreateDiscountSchema = z
  .object({
    name: z.string().trim().min(3).max(140),
    campaignType: z.enum(['FLASH_SALE', 'BULK_TIER', 'CATEGORY_OFFER', 'FIRST_ORDER']),
    discountType: z.enum(['PERCENTAGE', 'FIXED_BDT']),
    discountValue: z.number().positive().max(1_000_000),
    targetCategoryId: z.string().trim().optional(),
    minQty: z.number().int().min(1).max(1000),
    stackable: z.boolean(),
    daysValid: z.number().int().min(1).max(365).optional(),
  })
  .strict();

const UpdateDiscountSchema = z
  .object({
    name: z.string().trim().min(3).max(140).optional(),
    discountValue: z.number().positive().max(1_000_000).optional(),
    minQty: z.number().int().min(1).max(1000).optional(),
    stackable: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const UpdateStoreSettingsSchema = z
  .object({
    storeName: z.string().trim().min(2).max(100).optional(),
    supportEmail: z.string().trim().email().optional(),
    supportPhone: z.string().trim().min(5).max(30).optional(),
    currency: z.enum(['BDT', 'USD', 'EUR', 'GBP']).optional(),
    locale: z.string().trim().min(2).max(20).optional(),
    timezone: z.string().trim().min(2).max(60).optional(),
    taxRatePct: z.number().min(0).max(50).optional(),
    taxInclusivePricing: z.boolean().optional(),
    lowStockAlertThreshold: z.number().int().min(1).max(10_000).optional(),
    autoArchiveOutOfStock: z.boolean().optional(),
    orderNumberPrefix: z.string().trim().min(1).max(8).optional(),
    guestCheckoutEnabled: z.boolean().optional(),
    customDomain: z.string().trim().min(3).max(120).optional(),
  })
  .strict();

const UpdateStoreBrandingSchema = z
  .object({
    themeCode: z.string().trim().min(2).max(60).optional(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    fontHeading: z.string().trim().min(2).max(80).optional(),
    fontBody: z.string().trim().min(2).max(80).optional(),
    headerAnnouncement: z.string().trim().min(2).max(200).optional(),
    heroHeadline: z.string().trim().min(2).max(160).optional(),
    heroSubheadline: z.string().trim().min(2).max(260).optional(),
    footerText: z.string().trim().min(2).max(160).optional(),
    showPoweredByNexora: z.boolean().optional(),
  })
  .strict();

const UpdatePaymentGatewaySchema = z
  .object({
    isEnabled: z.boolean().optional(),
    mode: z.enum(['SANDBOX', 'LIVE']).optional(),
    merchantAccountInput: z.string().trim().min(3).max(80).optional(),
    apiSecretProvided: z.boolean().optional(),
  })
  .strict();

const CreateShippingMethodSchema = z
  .object({
    code: z.string().trim().min(2).max(32),
    name: z.string().trim().min(3).max(120),
    zoneName: z.string().trim().min(2).max(120),
    carrier: z.string().trim().min(2).max(80),
    baseRateBDT: z.number().min(0).max(100_000),
    freeShippingThresholdBDT: z.number().min(0).max(1_000_000),
    estimatedDays: z.string().trim().min(2).max(60),
    codSupported: z.boolean(),
  })
  .strict();

const UpdateShippingMethodSchema = z
  .object({
    name: z.string().trim().min(3).max(120).optional(),
    zoneName: z.string().trim().min(2).max(120).optional(),
    carrier: z.string().trim().min(2).max(80).optional(),
    baseRateBDT: z.number().min(0).max(100_000).optional(),
    freeShippingThresholdBDT: z.number().min(0).max(1_000_000).optional(),
    estimatedDays: z.string().trim().min(2).max(60).optional(),
    codSupported: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const InviteStaffSchema = z
  .object({
    email: z.string().trim().email(),
    roleSlug: z.string().trim().min(2).max(60),
  })
  .strict();

const UpdateStaffRoleSchema = z
  .object({
    roleSlug: z.string().trim().min(2).max(60),
  })
  .strict();

const UpdateSubscriptionSchema = z
  .object({
    planCode: z.enum(['STARTER', 'GROWTH', 'PRO', 'ENTERPRISE']).optional(),
    billingCycle: z.enum(['MONTHLY', 'YEARLY']).optional(),
    cancelAutoRenew: z.boolean().optional(),
  })
  .strict();

// ==========================================
// 1. VERIFICATION SUITE & MY STORES
// ==========================================
tenantRouter.all('/verify', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await runTenantVerificationSuite();
    sendSuccess(res, report);
  } catch (err) {
    next(err);
  }
});

tenantRouter.get('/my-stores', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await tenantService.getMyStores(req.auth!);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 2. STORE OVERVIEW & ANALYTICS
// ==========================================
tenantRouter.get(
  '/:tenantId/overview',
  requireTenantPermission(['product:read', 'order:read', 'inventory:read'], { allowAnyOf: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const overview = await tenantService.getOverview(req.tenantAuth!.tenantId, req.tenantAuth!);
      sendSuccess(res, overview);
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.get(
  '/:tenantId/analytics',
  requireTenantPermission(['order:read', 'product:read'], { allowAnyOf: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const analytics = await tenantService.getAnalytics(req.tenantAuth!.tenantId);
      sendSuccess(res, analytics);
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 3. CATALOG: PRODUCTS, CATEGORIES, BRANDS, INVENTORY
// ==========================================
tenantRouter.get(
  '/:tenantId/catalog',
  requireTenantPermission(['product:read', 'inventory:read'], { allowAnyOf: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bundle = await tenantService.listCatalogBundle(req.tenantAuth!.tenantId);
      sendSuccess(res, bundle);
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.post(
  '/:tenantId/products',
  requireTenantPermission(['product:create']),
  validateRequest({ body: CreateProductSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await tenantService.createProduct({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        input: req.body,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, { product }, 201);
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.patch(
  '/:tenantId/products/:productId',
  requireTenantPermission(['product:update', 'product:update:own'], { allowAnyOf: true }),
  validateRequest({ body: UpdateProductSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await tenantService.updateProduct({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        productId: String(req.params.productId),
        patch: req.body,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, { product });
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.delete(
  '/:tenantId/products/:productId',
  requireTenantPermission(['product:delete']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await tenantService.deleteProduct({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        productId: String(req.params.productId),
        ipAddress: clientIp(req),
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.patch(
  '/:tenantId/inventory/:productId',
  requireTenantPermission(['inventory:update']),
  validateRequest({ body: AdjustInventorySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await tenantService.adjustInventory({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        productId: String(req.params.productId),
        newQty: req.body.newQty,
        lowStockThreshold: req.body.lowStockThreshold,
        reason: req.body.reason,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.post(
  '/:tenantId/categories',
  requireTenantPermission(['product:create']),
  validateRequest({ body: CreateCategorySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const category = await tenantService.createCategory({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        input: req.body,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, { category }, 201);
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.patch(
  '/:tenantId/categories/:categoryId',
  requireTenantPermission(['product:update']),
  validateRequest({ body: UpdateCategorySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const category = await tenantService.updateCategory({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        categoryId: String(req.params.categoryId),
        patch: req.body,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, { category });
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.delete(
  '/:tenantId/categories/:categoryId',
  requireTenantPermission(['product:delete']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await tenantService.deleteCategory({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        categoryId: String(req.params.categoryId),
        ipAddress: clientIp(req),
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.post(
  '/:tenantId/brands',
  requireTenantPermission(['product:create']),
  validateRequest({ body: CreateBrandSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const brand = await tenantService.createBrand({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        input: req.body,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, { brand }, 201);
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.patch(
  '/:tenantId/brands/:brandId',
  requireTenantPermission(['product:update']),
  validateRequest({ body: UpdateBrandSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const brand = await tenantService.updateBrand({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        brandId: String(req.params.brandId),
        patch: req.body,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, { brand });
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.delete(
  '/:tenantId/brands/:brandId',
  requireTenantPermission(['product:delete']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await tenantService.deleteBrand({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        brandId: String(req.params.brandId),
        ipAddress: clientIp(req),
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 4. ORDERS & CUSTOMERS
// ==========================================
tenantRouter.get(
  '/:tenantId/orders',
  requireTenantPermission(['order:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orders = await tenantService.listOrders(req.tenantAuth!.tenantId, {
        status: qStr(req.query.status),
        search: qStr(req.query.search),
      });
      sendSuccess(res, { orders });
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.patch(
  '/:tenantId/orders/:orderId/status',
  requireTenantPermission(['order:update']),
  validateRequest({ body: UpdateOrderStatusSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await tenantService.updateOrderStatus({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        orderId: String(req.params.orderId),
        status: req.body.status,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, { order });
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.get(
  '/:tenantId/customers',
  requireTenantPermission(['customer:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customers = await tenantService.listCustomers(req.tenantAuth!.tenantId, {
        segment: qStr(req.query.segment),
        search: qStr(req.query.search),
      });
      sendSuccess(res, { customers });
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.patch(
  '/:tenantId/customers/:customerId',
  requireTenantPermission(['customer:support']),
  validateRequest({ body: UpdateCustomerSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customer = await tenantService.updateCustomer({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        customerId: String(req.params.customerId),
        patch: req.body,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, { customer });
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 5. COUPONS & AUTOMATIC DISCOUNTS
// ==========================================
tenantRouter.get(
  '/:tenantId/coupons',
  requireTenantPermission(['marketing:manage', 'order:read'], { allowAnyOf: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const coupons = await tenantService.listCoupons(req.tenantAuth!.tenantId);
      sendSuccess(res, { coupons });
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.post(
  '/:tenantId/coupons',
  requireTenantPermission(['marketing:manage']),
  validateRequest({ body: CreateCouponSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const coupon = await tenantService.createCoupon({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        input: req.body,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, { coupon }, 201);
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.patch(
  '/:tenantId/coupons/:couponId',
  requireTenantPermission(['marketing:manage']),
  validateRequest({ body: UpdateCouponSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const coupon = await tenantService.updateCoupon({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        couponId: String(req.params.couponId),
        patch: req.body,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, { coupon });
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.delete(
  '/:tenantId/coupons/:couponId',
  requireTenantPermission(['marketing:manage']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await tenantService.deleteCoupon({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        couponId: String(req.params.couponId),
        ipAddress: clientIp(req),
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.get(
  '/:tenantId/discounts',
  requireTenantPermission(['marketing:manage', 'order:read'], { allowAnyOf: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const discounts = await tenantService.listDiscounts(req.tenantAuth!.tenantId);
      sendSuccess(res, { discounts });
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.post(
  '/:tenantId/discounts',
  requireTenantPermission(['marketing:manage']),
  validateRequest({ body: CreateDiscountSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const discount = await tenantService.createDiscount({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        input: req.body,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, { discount }, 201);
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.patch(
  '/:tenantId/discounts/:discountId',
  requireTenantPermission(['marketing:manage']),
  validateRequest({ body: UpdateDiscountSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const discount = await tenantService.updateDiscount({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        discountId: String(req.params.discountId),
        patch: req.body,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, { discount });
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.delete(
  '/:tenantId/discounts/:discountId',
  requireTenantPermission(['marketing:manage']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await tenantService.deleteDiscount({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        discountId: String(req.params.discountId),
        ipAddress: clientIp(req),
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 6. STORE SETTINGS, BRANDING, PAYMENTS, SHIPPING, SUBSCRIPTION & STAFF
// ==========================================
tenantRouter.get(
  '/:tenantId/settings',
  requireTenantPermission(['settings:manage']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await tenantService.getStoreSettings(req.tenantAuth!.tenantId);
      sendSuccess(res, { settings });
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.put(
  '/:tenantId/settings',
  requireTenantPermission(['settings:manage']),
  validateRequest({ body: UpdateStoreSettingsSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await tenantService.updateStoreSettings({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        patch: req.body,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, { settings });
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.get(
  '/:tenantId/branding',
  requireTenantPermission(['theme:manage', 'settings:manage'], { allowAnyOf: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const branding = await tenantService.getStoreBranding(req.tenantAuth!.tenantId);
      sendSuccess(res, { branding });
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.put(
  '/:tenantId/branding',
  requireTenantPermission(['theme:manage']),
  validateRequest({ body: UpdateStoreBrandingSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const branding = await tenantService.updateStoreBranding({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        patch: req.body,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, { branding });
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.get(
  '/:tenantId/payments',
  requireTenantPermission(['settings:manage']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const gateways = await tenantService.listPaymentSettings(req.tenantAuth!.tenantId);
      sendSuccess(res, { gateways });
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.patch(
  '/:tenantId/payments/:gateway',
  requireTenantPermission(['settings:manage']),
  validateRequest({ body: UpdatePaymentGatewaySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const gateway = await tenantService.updatePaymentSetting({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        gateway: String(req.params.gateway).toUpperCase() as any,
        patch: req.body,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, { gateway });
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.get(
  '/:tenantId/shipping',
  requireTenantPermission(['settings:manage', 'order:read'], { allowAnyOf: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const methods = await tenantService.listShippingMethods(req.tenantAuth!.tenantId);
      sendSuccess(res, { methods });
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.post(
  '/:tenantId/shipping',
  requireTenantPermission(['settings:manage']),
  validateRequest({ body: CreateShippingMethodSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const method = await tenantService.createShippingMethod({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        input: req.body,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, { method }, 201);
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.patch(
  '/:tenantId/shipping/:methodId',
  requireTenantPermission(['settings:manage']),
  validateRequest({ body: UpdateShippingMethodSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const method = await tenantService.updateShippingMethod({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        methodId: String(req.params.methodId),
        patch: req.body,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, { method });
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.delete(
  '/:tenantId/shipping/:methodId',
  requireTenantPermission(['settings:manage']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await tenantService.deleteShippingMethod({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        methodId: String(req.params.methodId),
        ipAddress: clientIp(req),
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.get(
  '/:tenantId/staff',
  requireTenantPermission(['staff:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const staff = await tenantService.getStaffBundle(req.tenantAuth!.tenantId);
      sendSuccess(res, staff);
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.post(
  '/:tenantId/staff/invite',
  requireTenantPermission(['staff:invite']),
  validateRequest({ body: InviteStaffSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await tenantService.inviteStaff({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        email: req.body.email,
        roleSlug: req.body.roleSlug,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.patch(
  '/:tenantId/staff/:userId/role',
  requireTenantPermission(['role:assign']),
  validateRequest({ body: UpdateStaffRoleSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const membership = await rbacService.assignTenantMemberRole({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        targetUserId: String(req.params.userId),
        roleSlug: req.body.roleSlug,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, { membership });
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.delete(
  '/:tenantId/staff/:userId',
  requireTenantPermission(['role:assign']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await rbacService.revokeTenantMember({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        targetUserId: String(req.params.userId),
        ipAddress: clientIp(req),
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.get(
  '/:tenantId/subscription',
  requireTenantPermission(['settings:manage', 'product:read'], { allowAnyOf: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await tenantService.getSubscriptionDetails(req.tenantAuth!.tenantId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.patch(
  '/:tenantId/subscription',
  requireTenantPermission(['settings:manage']),
  validateRequest({ body: UpdateSubscriptionSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await tenantService.updateSubscription({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        planCode: req.body.planCode,
        billingCycle: req.body.billingCycle,
        cancelAutoRenew: req.body.cancelAutoRenew,
        ipAddress: clientIp(req),
      });
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }
);

tenantRouter.get(
  '/:tenantId/audit-logs',
  requireTenantPermission(['audit:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const logs = await rbacService.listActivityLogs({
        tenantId: req.tenantAuth!.tenantId,
        limit: 40,
      });
      sendSuccess(res, { logs });
    } catch (err) {
      next(err);
    }
  }
);
