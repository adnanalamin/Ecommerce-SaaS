/**
 * NEXORA RBAC & Authorization Routes (/api/v1/rbac)
 * Server-enforced granular permissions, role governance, staff invitations,
 * store-scoped resources, ownership/IDOR checks, and activity logs.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateRequest } from '../../middleware/validateRequest.ts';
import { requireAuth } from '../../middleware/authenticate.ts';
import {
  optionalAuth,
  requirePlatformPermission,
  requireTenantPermission,
} from '../../middleware/authorize.ts';
import { rbacService } from '../../rbac/rbacService.ts';
import { rbacRepository } from '../../rbac/rbacRepository.ts';
import { sendError, sendSuccess } from '../../utils/apiResponse.ts';
import { ForbiddenError } from '../../utils/errors.ts';

export const rbacRouter = Router();

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim().slice(0, 64);
  return (req.ip || req.socket.remoteAddress || '127.0.0.1').slice(0, 64);
}

// ==========================================
// STRICT ZOD SCHEMAS
// ==========================================
const PlatformAssignSchema = z
  .object({
    email: z.string().trim().email(),
    roleSlug: z.string().trim().min(2).max(50),
  })
  .strict();

const PlatformRevokeSchema = z
  .object({
    userId: z.string().trim().min(6).max(100),
  })
  .strict();

const UpdateRolePermissionsSchema = z
  .object({
    permissionCodes: z.array(z.string().trim().min(3).max(80)).min(1).max(64),
  })
  .strict();

const CreateCustomRoleSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    slug: z.string().trim().min(2).max(50).regex(/^[a-z0-9_]+$/),
    description: z.string().trim().max(200).optional(),
    permissionCodes: z.array(z.string().trim().min(3).max(80)).min(1).max(64),
  })
  .strict();

const AssignMemberRoleSchema = z
  .object({
    roleSlug: z.string().trim().min(2).max(50),
  })
  .strict();

const InviteStaffSchema = z
  .object({
    email: z.string().trim().email(),
    roleSlug: z.string().trim().min(2).max(50),
  })
  .strict();

const AcceptInviteSchema = z
  .object({
    token: z.string().trim().min(16).max(256),
  })
  .strict();

const CreateProductSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    sku: z.string().trim().min(2).max(40),
    priceBDT: z.number().positive().max(10_000_000),
    stockQty: z.number().int().min(0).max(1_000_000),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  })
  .strict();

const UpdateProductSchema = z
  .object({
    title: z.string().trim().min(2).max(120).optional(),
    priceBDT: z.number().positive().max(10_000_000).optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  })
  .strict();

const AdjustInventorySchema = z
  .object({
    stockQty: z.number().int().min(0).max(1_000_000),
  })
  .strict();

const CreateOrderSchema = z
  .object({
    itemsSummary: z.string().trim().min(3).max(240),
    totalBDT: z.number().positive().max(10_000_000),
  })
  .strict();

const UpdateOrderStatusSchema = z
  .object({
    status: z.enum(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']),
  })
  .strict();

// ==========================================
// 1. OVERVIEW & CURRENT USER EFFECTIVE PERMISSIONS
// ==========================================
rbacRouter.get('/overview', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const overview = await rbacService.getPublicRbacOverview();
    return sendSuccess(res, overview);
  } catch (err) {
    next(err);
  }
});

rbacRouter.get('/me/permissions', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await rbacService.getMyPermissionsSummary(req.auth);
    return sendSuccess(res, summary);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 2. STOREFRONT PUBLIC CATALOG (GUEST / CUSTOMER ALLOWED)
// ==========================================
rbacRouter.get('/storefront/:tenantId/catalog', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const products = await rbacService.listPublicStorefrontProducts(String(req.params.tenantId));
    return sendSuccess(res, {
      viewerRole: req.auth ? req.auth.userType : 'GUEST',
      products,
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 3. PLATFORM-LEVEL GOVERNANCE ENDPOINTS
// ==========================================
rbacRouter.get(
  '/platform/tenants',
  requirePlatformPermission('platform:tenants:read'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const tenants = await rbacRepository.listTenants();
      return sendSuccess(res, { tenants });
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.get(
  '/platform/finance/summary',
  requirePlatformPermission('platform:finance:read'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const tenants = await rbacRepository.listTenants();
      return sendSuccess(res, {
        platformMRR_BDT: 148500,
        activeTenants: tenants.length,
        pendingSettlementsBDT: 42300,
      });
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.get(
  '/platform/users',
  requirePlatformPermission('platform:tenants:read'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const users = await rbacService.listPlatformUsersAndRoles();
      return sendSuccess(res, { users });
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.post(
  '/platform/roles/assign',
  requirePlatformPermission('platform:roles:assign'),
  validateRequest({ body: PlatformAssignSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await rbacService.assignPlatformRole({
        actor: req.auth!,
        targetEmail: req.body.email,
        roleSlug: req.body.roleSlug,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.post(
  '/platform/roles/revoke',
  requirePlatformPermission('platform:roles:assign'),
  validateRequest({ body: PlatformRevokeSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await rbacService.revokePlatformRole({
        actor: req.auth!,
        targetUserId: req.body.userId,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.get(
  '/platform/activity-logs',
  requirePlatformPermission('platform:audit:read'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const logs = await rbacService.listActivityLogs({ limit: 80 });
      return sendSuccess(res, { logs });
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 4. STAFF INVITATION ACCEPTANCE (ANY AUTHENTICATED USER)
// ==========================================
rbacRouter.post(
  '/invitations/accept',
  requireAuth,
  validateRequest({ body: AcceptInviteSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await rbacService.acceptStaffInvitation({
        actor: req.auth!,
        token: req.body.token,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 5. TENANT-SCOPED ROLES, MEMBERSHIPS & INVITATIONS
// ==========================================
rbacRouter.get(
  '/tenants/:tenantId/roles',
  requireTenantPermission(['staff:read', 'role:manage', 'role:assign'], { allowAnyOf: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roles = await rbacService.listTenantRoles(req.tenantAuth!.tenantId);
      return sendSuccess(res, { roles });
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.post(
  '/tenants/:tenantId/roles',
  requireTenantPermission(['role:manage']),
  validateRequest({ body: CreateCustomRoleSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = await rbacService.createCustomTenantRole({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        ...req.body,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { role }, 201);
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.patch(
  '/tenants/:tenantId/roles/:roleSlug',
  requireTenantPermission(['role:manage']),
  validateRequest({ body: UpdateRolePermissionsSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = await rbacService.updateTenantRolePermissions({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        roleSlug: String(req.params.roleSlug),
        permissionCodes: req.body.permissionCodes,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { role });
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.get(
  '/tenants/:tenantId/members',
  requireTenantPermission(['staff:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await rbacService.listTenantMembershipsAndInvites(req.tenantAuth!.tenantId);
      return sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.post(
  '/tenants/:tenantId/members/:userId/role',
  requireTenantPermission(['role:assign']),
  validateRequest({ body: AssignMemberRoleSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const membership = await rbacService.assignTenantMemberRole({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        targetUserId: String(req.params.userId),
        roleSlug: req.body.roleSlug,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { membership });
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.delete(
  '/tenants/:tenantId/members/:userId',
  requireTenantPermission(['role:assign']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await rbacService.revokeTenantMember({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        targetUserId: String(req.params.userId),
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.post(
  '/tenants/:tenantId/invitations',
  requireTenantPermission(['staff:invite']),
  validateRequest({ body: InviteStaffSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await rbacService.inviteStaff({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        email: req.body.email,
        roleSlug: req.body.roleSlug,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.get(
  '/tenants/:tenantId/activity-logs',
  requireTenantPermission(['audit:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const logs = await rbacService.listActivityLogs({
        tenantId: req.tenantAuth!.tenantId,
        limit: 80,
      });
      return sendSuccess(res, { logs });
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 6. TENANT-SCOPED PROTECTED RESOURCES (PRODUCTS, INVENTORY, MARKETING, ORDERS)
// ==========================================
rbacRouter.get(
  '/tenants/:tenantId/products',
  requireTenantPermission(['product:read']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const products = await rbacService.listTenantProducts(req.tenantAuth!.tenantId);
      return sendSuccess(res, { products });
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.post(
  '/tenants/:tenantId/products',
  requireTenantPermission(['product:create']),
  validateRequest({ body: CreateProductSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await rbacService.createTenantProduct({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        ...req.body,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { product }, 201);
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.patch(
  '/tenants/:tenantId/products/:productId',
  requireTenantPermission(['product:update', 'product:update:own'], { allowAnyOf: true }),
  validateRequest({ body: UpdateProductSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await rbacService.updateTenantProduct({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        productId: String(req.params.productId),
        patch: req.body,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { product });
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.patch(
  '/tenants/:tenantId/products/:productId/inventory',
  requireTenantPermission(['inventory:update']),
  validateRequest({ body: AdjustInventorySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await rbacService.adjustProductInventory({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        productId: String(req.params.productId),
        stockQty: req.body.stockQty,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { product });
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.delete(
  '/tenants/:tenantId/products/:productId',
  requireTenantPermission(['product:delete']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await rbacService.deleteTenantProduct({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        productId: String(req.params.productId),
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.post(
  '/tenants/:tenantId/marketing/coupons',
  requireTenantPermission(['marketing:manage']),
  validateRequest({
    body: z.object({ code: z.string().trim().min(3).max(24), discountPercent: z.number().min(1).max(90) }).strict(),
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await rbacRepository.recordAdminActivity({
        scope: 'TENANT',
        tenantId: req.tenantAuth!.tenantId,
        actorUserId: req.auth!.userId,
        actorEmail: req.auth!.email,
        actorRole: req.tenantAuth!.roleSlug,
        action: 'RESOURCE_CREATED',
        resourceType: 'Coupon',
        resourceId: req.body.code.toUpperCase(),
        outcome: 'ALLOWED',
        reason: `Created promotional coupon ${req.body.code.toUpperCase()} (${req.body.discountPercent}% off).`,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { coupon: { code: req.body.code.toUpperCase(), discountPercent: req.body.discountPercent } }, 201);
    } catch (err) {
      next(err);
    }
  }
);

// ORDERS (BOTH TENANT STAFF & CUSTOMER WITH STRICT RESOURCE OWNERSHIP)
rbacRouter.get(
  '/tenants/:tenantId/orders',
  requireTenantPermission(['order:read'], { allowCustomerPermissions: ['storefront:order:read:own'] }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orders = await rbacService.listOrdersForActor({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
      });
      return sendSuccess(res, { orders });
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.get(
  '/tenants/:tenantId/orders/:orderId',
  requireTenantPermission(['order:read'], { allowCustomerPermissions: ['storefront:order:read:own'] }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await rbacService.getOrderWithOwnershipCheck({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        orderId: String(req.params.orderId),
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { order });
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.post(
  '/tenants/:tenantId/orders',
  requireTenantPermission(['order:read'], { allowCustomerPermissions: ['storefront:order:create'] }),
  validateRequest({ body: CreateOrderSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await rbacService.createCustomerOrder({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        ...req.body,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { order }, 201);
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.patch(
  '/tenants/:tenantId/orders/:orderId/cancel',
  requireTenantPermission(['order:update'], { allowCustomerPermissions: ['storefront:order:cancel:own'] }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.tenantAuth!.scope === 'TENANT') {
        const order = await rbacService.updateTenantOrderStatus({
          actor: req.auth!,
          tenantAuth: req.tenantAuth!,
          orderId: String(req.params.orderId),
          status: 'CANCELLED',
          ipAddress: clientIp(req),
        });
        return sendSuccess(res, { order });
      }
      const order = await rbacService.cancelOwnOrder({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        orderId: String(req.params.orderId),
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { order });
    } catch (err) {
      next(err);
    }
  }
);

rbacRouter.patch(
  '/tenants/:tenantId/orders/:orderId/status',
  requireTenantPermission(['order:update']),
  validateRequest({ body: UpdateOrderStatusSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.tenantAuth!.scope !== 'TENANT') {
        throw new ForbiddenError('Only authorized store staff may update fulfillment statuses.', 'TENANT_PERMISSION_REQUIRED');
      }
      const order = await rbacService.updateTenantOrderStatus({
        actor: req.auth!,
        tenantAuth: req.tenantAuth!,
        orderId: String(req.params.orderId),
        status: req.body.status,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { order });
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 7. AUTOMATED RBAC VERIFICATION SUITE
// ==========================================
rbacRouter.all('/verify', async (_req: Request, res: Response) => {
  try {
    const { runRbacVerificationSuite } = await import('../../rbac/testRbac.ts');
    const report = await runRbacVerificationSuite();
    return sendSuccess(res, report);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'RBAC verification suite failed';
    return sendError(res, 500, 'RBAC_VERIFY_ERROR', msg);
  }
});
