/**
 * NEXORA Super Admin Platform Governance Routes (/api/v1/platform)
 *
 * Strict permission-gated endpoints covering:
 *  - Executive Overview & Real Aggregations
 *  - Tenants & Stores Management
 *  - Users & Platform Admins Governance
 *  - Subscriptions, Plans, Payments & Refunds Monitoring
 *  - Advertisement Policy, Platform Branding & Global Settings
 *  - Audit Logs & Permission-Checked CSV Exports
 *  - Support Tickets & Controlled, Logged Tenant Support Access
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateRequest } from '../../middleware/validateRequest.ts';
import { requirePlatformPermission } from '../../middleware/authorize.ts';
import { platformService, rbacService } from '../../platform/platformService.ts';
import { sendError, sendSuccess } from '../../utils/apiResponse.ts';

export const platformRouter = Router();

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim().slice(0, 64);
  return (req.ip || req.socket.remoteAddress || '127.0.0.1').slice(0, 64);
}

function queryStr(val: unknown): string | undefined {
  return typeof val === 'string' ? val.trim() : undefined;
}

function queryNum(val: unknown, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ==========================================
// ZOD SCHEMAS
// ==========================================
const TenantStatusSchema = z
  .object({
    status: z.enum(['ACTIVE', 'SUSPENDED']),
    reason: z.string().trim().min(3).max(300).optional(),
  })
  .strict();

const ArchiveTenantSchema = z
  .object({
    reason: z.string().trim().min(5).max(300),
  })
  .strict();

const UserStatusSchema = z
  .object({
    status: z.enum(['ACTIVE', 'SUSPENDED']),
    reason: z.string().trim().min(3).max(300),
  })
  .strict();

const RevokeSessionsSchema = z
  .object({
    reason: z.string().trim().min(3).max(300),
  })
  .strict();

const AssignAdminRoleSchema = z
  .object({
    email: z.string().trim().email(),
    roleSlug: z.enum(['super_admin', 'platform_admin', 'finance_manager', 'support_agent']),
  })
  .strict();

const RevokeAdminRoleSchema = z
  .object({
    userId: z.string().trim().min(6).max(100),
  })
  .strict();

const UpdateSubscriptionSchema = z
  .object({
    planCode: z.enum(['STARTER', 'GROWTH', 'PRO', 'ENTERPRISE']).optional(),
    status: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED']).optional(),
    billingCycle: z.enum(['MONTHLY', 'YEARLY']).optional(),
  })
  .strict();

const UpdatePlanSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    description: z.string().trim().min(4).max(300).optional(),
    priceMonthlyBDT: z.number().min(0).max(500_000).optional(),
    priceMonthlyUSD: z.number().min(0).max(10_000).optional(),
    maxProducts: z.number().int().min(1).max(1_000_000).optional(),
    maxStaffUsers: z.number().int().min(1).max(500).optional(),
    maxStorageMB: z.number().int().min(128).max(10_000_000).optional(),
    transactionFeePercent: z.number().min(0).max(15).optional(),
    customDomainAllowed: z.boolean().optional(),
    adSenseAllowed: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const ReconcilePaymentSchema = z
  .object({
    status: z.enum(['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REVERSED']),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

const ProcessRefundSchema = z
  .object({
    status: z.enum(['COMPLETED', 'FAILED']),
  })
  .strict();

const UpdateAdPolicySchema = z
  .object({
    isEnabled: z.boolean().optional(),
    autoAdsEnabled: z.boolean().optional(),
    isConsentBannerEnabled: z.boolean().optional(),
    publisherId: z.string().trim().max(80).optional(),
  })
  .strict();

const UpdateBrandingSchema = z
  .object({
    platformName: z.string().trim().min(2).max(80).optional(),
    tagline: z.string().trim().min(2).max(160).optional(),
    supportEmail: z.string().trim().email().optional(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    surfaceTint: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    footerAttribution: z.string().trim().min(2).max(120).optional(),
    allowMerchantCustomCss: z.boolean().optional(),
  })
  .strict();

const UpdateGlobalSettingSchema = z
  .object({
    value: z.union([z.string().trim().min(1).max(200), z.number().min(0).max(10000), z.boolean()]),
  })
  .strict();

const UpdateTicketSchema = z
  .object({
    status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_MERCHANT', 'RESOLVED', 'CLOSED']).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    replyBody: z.string().trim().min(2).max(2000).optional(),
  })
  .strict();

const RequestSupportAccessSchema = z
  .object({
    tenantId: z.string().trim().min(4).max(100),
    ticketId: z.string().trim().min(4).max(100),
    reason: z.string().trim().min(10).max(500),
    durationMinutes: z.number().int().min(5).max(60).default(30),
    accessScope: z.enum(['READ_DIAGNOSTICS', 'ORDER_ASSIST']).default('READ_DIAGNOSTICS'),
  })
  .strict();

// ==========================================
// 1. OVERVIEW
// ==========================================
platformRouter.get(
  '/overview',
  requirePlatformPermission('platform:tenants:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const overview = await platformService.getDashboardOverview(req.auth!);
      return sendSuccess(res, overview);
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 2. TENANTS & STORES MANAGEMENT
// ==========================================
platformRouter.get(
  '/tenants',
  requirePlatformPermission('platform:tenants:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await platformService.listTenants({
        search: queryStr(req.query.search),
        status: queryStr(req.query.status),
        tier: queryStr(req.query.tier),
        ownership: queryStr(req.query.ownership),
        page: queryNum(req.query.page, 1),
        limit: queryNum(req.query.limit, 8),
      });
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.patch(
  '/tenants/:tenantId/status',
  requirePlatformPermission('platform:tenants:manage'),
  validateRequest({ body: TenantStatusSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await platformService.updateTenantLifecycle({
        actor: req.auth!,
        tenantId: String(req.params.tenantId),
        status: req.body.status,
        reason: req.body.reason,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { tenant: updated });
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.delete(
  '/tenants/:tenantId',
  requirePlatformPermission('platform:tenants:manage'),
  validateRequest({ body: ArchiveTenantSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await platformService.archiveTenant({
        actor: req.auth!,
        tenantId: String(req.params.tenantId),
        reason: req.body.reason,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 3. USERS & PLATFORM ADMINS MANAGEMENT
// ==========================================
platformRouter.get(
  '/users',
  requirePlatformPermission('platform:tenants:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await platformService.listUsers({
        search: queryStr(req.query.search),
        userType: queryStr(req.query.userType),
        status: queryStr(req.query.status),
        page: queryNum(req.query.page, 1),
        limit: queryNum(req.query.limit, 8),
      });
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.patch(
  '/users/:userId/status',
  requirePlatformPermission('platform:tenants:manage'),
  validateRequest({ body: UserStatusSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await platformService.updateUserStatus({
        actor: req.auth!,
        targetUserId: String(req.params.userId),
        status: req.body.status,
        reason: req.body.reason,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.post(
  '/users/:userId/revoke-sessions',
  requirePlatformPermission('platform:tenants:manage'),
  validateRequest({ body: RevokeSessionsSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await platformService.revokeUserSessions({
        actor: req.auth!,
        targetUserId: String(req.params.userId),
        reason: req.body.reason,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.get(
  '/admins',
  requirePlatformPermission('platform:tenants:read'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const admins = await rbacService.listPlatformUsersAndRoles();
      return sendSuccess(res, { admins });
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.post(
  '/admins/assign',
  requirePlatformPermission('platform:roles:assign'),
  validateRequest({ body: AssignAdminRoleSchema }),
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

platformRouter.post(
  '/admins/revoke',
  requirePlatformPermission('platform:roles:assign'),
  validateRequest({ body: RevokeAdminRoleSchema }),
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

// ==========================================
// 4. SUBSCRIPTIONS, PLANS, PAYMENTS & REFUNDS
// ==========================================
platformRouter.get(
  '/subscriptions',
  requirePlatformPermission('platform:finance:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await platformService.listSubscriptions({
        search: queryStr(req.query.search),
        status: queryStr(req.query.status),
        planCode: queryStr(req.query.planCode),
        page: queryNum(req.query.page, 1),
        limit: queryNum(req.query.limit, 8),
      });
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.patch(
  '/subscriptions/:tenantId',
  requirePlatformPermission('platform:finance:manage'),
  validateRequest({ body: UpdateSubscriptionSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subscription = await platformService.updateSubscription({
        actor: req.auth!,
        tenantId: String(req.params.tenantId),
        ...req.body,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { subscription });
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.get(
  '/plans',
  requirePlatformPermission('platform:finance:read'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const plans = await platformService.listPlans();
      return sendSuccess(res, { plans });
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.patch(
  '/plans/:code',
  requirePlatformPermission('platform:finance:manage'),
  validateRequest({ body: UpdatePlanSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const code = String(req.params.code).toUpperCase() as 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';
      const plan = await platformService.updatePlan({
        actor: req.auth!,
        code,
        patch: req.body,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { plan });
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.get(
  '/payments',
  requirePlatformPermission('platform:finance:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await platformService.listPayments({
        search: queryStr(req.query.search),
        status: queryStr(req.query.status),
        gateway: queryStr(req.query.gateway),
        page: queryNum(req.query.page, 1),
        limit: queryNum(req.query.limit, 8),
      });
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.patch(
  '/payments/:paymentId/reconcile',
  requirePlatformPermission('platform:finance:manage'),
  validateRequest({ body: ReconcilePaymentSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payment = await platformService.reconcilePayment({
        actor: req.auth!,
        paymentId: String(req.params.paymentId),
        status: req.body.status,
        note: req.body.note,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { payment });
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.get(
  '/refunds',
  requirePlatformPermission('platform:finance:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await platformService.listRefunds({
        search: queryStr(req.query.search),
        status: queryStr(req.query.status),
        page: queryNum(req.query.page, 1),
        limit: queryNum(req.query.limit, 8),
      });
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.patch(
  '/refunds/:refundId',
  requirePlatformPermission('platform:finance:manage'),
  validateRequest({ body: ProcessRefundSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refund = await platformService.processRefund({
        actor: req.auth!,
        refundId: String(req.params.refundId),
        status: req.body.status,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { refund });
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 5. ADS, BRANDING, GLOBAL SETTINGS & AUDIT LOGS
// ==========================================
platformRouter.get(
  '/ads',
  requirePlatformPermission('platform:ads:manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await platformService.listAdvertisements({
        search: queryStr(req.query.search),
        page: queryNum(req.query.page, 1),
        limit: queryNum(req.query.limit, 8),
      });
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.patch(
  '/ads/:tenantId',
  requirePlatformPermission('platform:ads:manage'),
  validateRequest({ body: UpdateAdPolicySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adPolicy = await platformService.updateAdvertisementPolicy({
        actor: req.auth!,
        tenantId: String(req.params.tenantId),
        patch: req.body,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { adPolicy });
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.get(
  '/branding',
  requirePlatformPermission('platform:settings:manage'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const branding = await platformService.getPlatformBranding();
      return sendSuccess(res, { branding });
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.patch(
  '/branding',
  requirePlatformPermission('platform:settings:manage'),
  validateRequest({ body: UpdateBrandingSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const branding = await platformService.updatePlatformBranding({
        actor: req.auth!,
        patch: req.body,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { branding });
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.get(
  '/settings',
  requirePlatformPermission('platform:settings:manage'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await platformService.listGlobalSettings();
      return sendSuccess(res, { settings });
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.patch(
  '/settings/:key',
  requirePlatformPermission('platform:settings:manage'),
  validateRequest({ body: UpdateGlobalSettingSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const setting = await platformService.updateGlobalSetting({
        actor: req.auth!,
        key: String(req.params.key),
        value: req.body.value,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { setting });
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.get(
  '/audit-logs',
  requirePlatformPermission('platform:audit:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await platformService.listAuditLogs({
        search: queryStr(req.query.search),
        scope: queryStr(req.query.scope),
        outcome: queryStr(req.query.outcome),
        page: queryNum(req.query.page, 1),
        limit: queryNum(req.query.limit, 10),
      });
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 6. PERMISSION-CHECKED CSV EXPORTS
// ==========================================
platformRouter.get(
  '/export/:dataset',
  requirePlatformPermission('platform:export:data'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dataset = String(req.params.dataset).toLowerCase() as
        | 'tenants'
        | 'users'
        | 'payments'
        | 'refunds'
        | 'audit_logs';
      if (!['tenants', 'users', 'payments', 'refunds', 'audit_logs'].includes(dataset)) {
        return sendError(res, 400, 'INVALID_EXPORT_DATASET', 'Unsupported export dataset requested.');
      }
      const exported = await platformService.exportDatasetCsv({
        actor: req.auth!,
        dataset,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, exported);
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 7. SUPPORT TICKETS & CONTROLLED SUPPORT ACCESS
// ==========================================
platformRouter.get(
  '/support/tickets',
  requirePlatformPermission('platform:support:manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await platformService.listSupportTickets({
        search: queryStr(req.query.search),
        status: queryStr(req.query.status),
        priority: queryStr(req.query.priority),
        page: queryNum(req.query.page, 1),
        limit: queryNum(req.query.limit, 8),
      });
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.patch(
  '/support/tickets/:ticketId',
  requirePlatformPermission('platform:support:manage'),
  validateRequest({ body: UpdateTicketSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticket = await platformService.updateSupportTicket({
        actor: req.auth!,
        ticketId: String(req.params.ticketId),
        ...req.body,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { ticket });
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.get(
  '/support/access-grants',
  requirePlatformPermission('platform:support:manage'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const grants = await platformService.listSupportAccessGrants();
      return sendSuccess(res, { grants });
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.post(
  '/support/access-grants',
  requirePlatformPermission('platform:support:manage'),
  validateRequest({ body: RequestSupportAccessSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const grant = await platformService.requestSupportAccessGrant({
        actor: req.auth!,
        ...req.body,
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { grant }, 201);
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.post(
  '/support/access-grants/:grantId/revoke',
  requirePlatformPermission('platform:support:manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const grant = await platformService.revokeSupportAccessGrant({
        actor: req.auth!,
        grantId: String(req.params.grantId),
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, { grant });
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.get(
  '/support/tenants/:tenantId/diagnostics',
  requirePlatformPermission('platform:support:manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await platformService.accessControlledTenantDiagnostics({
        actor: req.auth!,
        tenantId: String(req.params.tenantId),
        ipAddress: clientIp(req),
      });
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 8. AUTOMATED PHASE 09 VERIFICATION SUITE
// ==========================================
platformRouter.all('/verify', async (_req: Request, res: Response) => {
  try {
    const { runPlatformVerificationSuite } = await import('../../platform/testPlatform.ts');
    const report = await runPlatformVerificationSuite();
    return sendSuccess(res, report);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Platform verification suite failed';
    return sendError(res, 500, 'PLATFORM_VERIFY_ERROR', msg);
  }
});
