/**
 * NEXORA Super Admin Platform Repository (Dual-Mode: MongoDB + Sandbox)
 *
 * Manages platform-level financial ledgers (payments, refunds), storage telemetry,
 * advertisement governance, platform branding, global settings, support tickets,
 * and controlled, time-bounded support access grants.
 */

import { Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { isDatabaseConnected } from '../config/database.ts';
import {
  PaymentModel,
  RefundModel,
  AdvertisementModel,
  SystemSettingModel,
  SupportTicketModel,
  SupportAccessGrantModel,
  type PaymentGateway,
  type TransactionStatus,
  type SupportTicketStatus,
  type SupportTicketPriority,
  type SupportTicketCategory,
  type SupportAccessScope,
  type SupportAccessStatus,
} from '../db/models.ts';
import {
  ensureOnboardingBootstrapped,
  onboardingRepository,
  OFFICIAL_STORE_TENANT_ID,
} from '../onboarding/onboardingRepository.ts';
import {
  DEMO_TENANT_A_ID,
  DEMO_TENANT_B_ID,
  rbacRepository,
} from '../rbac/rbacRepository.ts';

export interface PlatformPaymentRecord {
  id: string;
  tenantId: string;
  tenantName: string;
  orderNumber: string;
  customerEmail: string;
  gateway: PaymentGateway;
  gatewayTransactionId: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  paymentMethodDetails: string;
  failureReason?: string;
  settledAt?: Date;
  createdAt: Date;
}

export interface PlatformRefundRecord {
  id: string;
  tenantId: string;
  tenantName: string;
  orderNumber: string;
  paymentId: string;
  gateway: PaymentGateway;
  amount: number;
  currency: string;
  reason: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  gatewayRefundId?: string;
  reviewedByEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlatformAdvertisementRecord {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  planCode: string;
  isEnabled: boolean;
  publisherId: string;
  autoAdsEnabled: boolean;
  isConsentBannerEnabled: boolean;
  activeUnitsCount: number;
  excludedRoutes: string[];
  monthlyImpressions: number;
  estimatedRevenueUSD: number;
  updatedAt: Date;
}

export interface PlatformBrandingConfig {
  platformName: string;
  tagline: string;
  supportEmail: string;
  primaryColor: string;
  accentColor: string;
  surfaceTint: string;
  logoUrl: string;
  faviconUrl: string;
  footerAttribution: string;
  allowMerchantCustomCss: boolean;
  updatedAt: string;
  updatedByEmail?: string;
}

export interface GlobalSettingItem {
  key: string;
  value: string | number | boolean;
  valueType: 'boolean' | 'number' | 'string';
  description: string;
  category: 'SECURITY' | 'BILLING' | 'NOTIFICATIONS' | 'GENERAL';
  isPublic: boolean;
  updatedAt: string;
  updatedByEmail?: string;
}

export interface SupportTicketRecord {
  id: string;
  ticketNumber: string;
  tenantId: string;
  tenantName: string;
  requesterEmail: string;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  assignedAgentEmail?: string;
  messages: Array<{
    authorEmail: string;
    authorRole: string;
    body: string;
    createdAt: Date;
  }>;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupportAccessGrantRecord {
  id: string;
  grantId: string;
  ticketId: string;
  ticketNumber: string;
  tenantId: string;
  tenantName: string;
  actorUserId: string;
  actorEmail: string;
  actorRole: string;
  accessScope: SupportAccessScope;
  reason: string;
  status: SupportAccessStatus;
  grantedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  revokedByEmail?: string;
  accessCount: number;
  lastAccessedAt?: Date;
}

// ==========================================
// SANDBOX IN-MEMORY STATE
// ==========================================
const sandboxPayments = new Map<string, PlatformPaymentRecord>();
const sandboxRefunds = new Map<string, PlatformRefundRecord>();
const sandboxAds = new Map<string, PlatformAdvertisementRecord>();
const sandboxStorageUsedMB = new Map<string, number>();
const sandboxTickets = new Map<string, SupportTicketRecord>();
const sandboxSupportGrants = new Map<string, SupportAccessGrantRecord>();
const sandboxGlobalSettings = new Map<string, GlobalSettingItem>();

let sandboxBranding: PlatformBrandingConfig = {
  platformName: 'NEXORA Commerce Cloud',
  tagline: 'Enterprise Multi-Tenant Commerce Operating System',
  supportEmail: 'support@nexora.cloud',
  primaryColor: '#4F46E5',
  accentColor: '#0284C7',
  surfaceTint: '#0F172A',
  logoUrl: '/brand/nexora-mark.svg',
  faviconUrl: '/brand/favicon.ico',
  footerAttribution: 'Powered by NEXORA Platform Infrastructure',
  allowMerchantCustomCss: true,
  updatedAt: new Date().toISOString(),
  updatedByEmail: 'superadmin@nexora.cloud',
};

const DEFAULT_GLOBAL_SETTINGS: Array<Omit<GlobalSettingItem, 'updatedAt'>> = [
  {
    key: 'security.enforce_admin_mfa',
    value: true,
    valueType: 'boolean',
    description: 'Require TOTP/WebAuthn MFA for all Platform Admin and Finance Manager accounts.',
    category: 'SECURITY',
    isPublic: false,
  },
  {
    key: 'security.max_login_attempts',
    value: 5,
    valueType: 'number',
    description: 'Failed password attempts before temporary Argon2/account lockout triggers.',
    category: 'SECURITY',
    isPublic: false,
  },
  {
    key: 'security.support_access_max_minutes',
    value: 60,
    valueType: 'number',
    description: 'Maximum duration (minutes) permitted for controlled tenant support sessions.',
    category: 'SECURITY',
    isPublic: false,
  },
  {
    key: 'billing.default_trial_days',
    value: 14,
    valueType: 'number',
    description: 'Default free trial window applied when upgrading from Starter Free.',
    category: 'BILLING',
    isPublic: true,
  },
  {
    key: 'billing.platform_transaction_fee_pct',
    value: 2.0,
    valueType: 'number',
    description: 'Default Starter-tier transaction fee percentage reconciled against store GMV.',
    category: 'BILLING',
    isPublic: true,
  },
  {
    key: 'general.maintenance_mode',
    value: false,
    valueType: 'boolean',
    description: 'Locks tenant storefront write mutations during planned cluster upgrades.',
    category: 'GENERAL',
    isPublic: true,
  },
  {
    key: 'general.merchant_self_registration',
    value: true,
    valueType: 'boolean',
    description: 'Allow public business owners to register and auto-provision new tenant stores.',
    category: 'GENERAL',
    isPublic: true,
  },
  {
    key: 'notifications.security_alert_digest',
    value: 'ops-security@nexora.cloud',
    valueType: 'string',
    description: 'Security operations distribution inbox for lockout & privilege escalation digests.',
    category: 'NOTIFICATIONS',
    isPublic: false,
  },
];

let platformBootstrapped = false;
let platformBootstrapPromise: Promise<void> | null = null;

export async function ensurePlatformBootstrapped(): Promise<void> {
  if (platformBootstrapped) return;
  if (platformBootstrapPromise) return platformBootstrapPromise;

  platformBootstrapPromise = (async () => {
    await ensureOnboardingBootstrapped();

    // Upgrade UrbanWear BD to GROWTH and LuxeThread to PRO so Free vs Paid & MRR charts reflect real plans
    await onboardingRepository.updateTenantSubscriptionRecord(DEMO_TENANT_A_ID, {
      planCode: 'GROWTH',
      status: 'ACTIVE',
      billingCycle: 'MONTHLY',
    });
    await onboardingRepository.updateTenantSubscriptionRecord(DEMO_TENANT_B_ID, {
      planCode: 'PRO',
      status: 'ACTIVE',
      billingCycle: 'YEARLY',
    });

    // Storage telemetry per tenant
    sandboxStorageUsedMB.set(DEMO_TENANT_A_ID, 3840);
    sandboxStorageUsedMB.set(DEMO_TENANT_B_ID, 14620);
    sandboxStorageUsedMB.set(OFFICIAL_STORE_TENANT_ID, 680);

    // Seed Global Settings
    const nowIso = new Date().toISOString();
    for (const def of DEFAULT_GLOBAL_SETTINGS) {
      if (isDatabaseConnected()) {
        await SystemSettingModel.findOneAndUpdate(
          { key: def.key },
          {
            $setOnInsert: {
              key: def.key,
              value: def.value,
              description: def.description,
              category: def.category,
              isPublic: def.isPublic,
            },
          },
          { upsert: true }
        );
      }
      if (!sandboxGlobalSettings.has(def.key)) {
        sandboxGlobalSettings.set(def.key, {
          ...def,
          updatedAt: nowIso,
          updatedByEmail: 'superadmin@nexora.cloud',
        });
      }
    }

    if (isDatabaseConnected()) {
      await SystemSettingModel.findOneAndUpdate(
        { key: 'platform.branding' },
        {
          $setOnInsert: {
            key: 'platform.branding',
            value: sandboxBranding,
            description: 'Global NEXORA Super Admin branding configuration',
            category: 'GENERAL',
            isPublic: true,
          },
        },
        { upsert: true }
      );
    }

    // Seed Platform Payments
    const now = Date.now();
    const seedPayments: Array<Omit<PlatformPaymentRecord, 'id'>> = [
      {
        tenantId: DEMO_TENANT_A_ID,
        tenantName: 'UrbanWear BD',
        orderNumber: 'ORD-UW-9001',
        customerEmail: 'buyer1@nexora.shop',
        gateway: 'BKASH',
        gatewayTransactionId: 'BKS-8921048A',
        amount: 3450,
        currency: 'BDT',
        status: 'SUCCESS',
        paymentMethodDetails: 'bKash Wallet •••• 1420',
        settledAt: new Date(now - 2 * 86400_000),
        createdAt: new Date(now - 2 * 86400_000),
      },
      {
        tenantId: DEMO_TENANT_A_ID,
        tenantName: 'UrbanWear BD',
        orderNumber: 'ORD-UW-9002',
        customerEmail: 'buyer2@nexora.shop',
        gateway: 'SSLCOMMERZ',
        gatewayTransactionId: 'SSL-5519032C',
        amount: 5890,
        currency: 'BDT',
        status: 'SUCCESS',
        paymentMethodDetails: 'Visa Debit •••• 4419',
        settledAt: new Date(now - 1 * 86400_000),
        createdAt: new Date(now - 1 * 86400_000),
      },
      {
        tenantId: DEMO_TENANT_B_ID,
        tenantName: 'LuxeThread Studio',
        orderNumber: 'ORD-LT-2041',
        customerEmail: 'buyer1@nexora.shop',
        gateway: 'STRIPE',
        gatewayTransactionId: 'pi_3Q9Luxe9921',
        amount: 12400,
        currency: 'BDT',
        status: 'SUCCESS',
        paymentMethodDetails: 'Mastercard •••• 8821',
        settledAt: new Date(now - 3 * 86400_000),
        createdAt: new Date(now - 3 * 86400_000),
      },
      {
        tenantId: DEMO_TENANT_B_ID,
        tenantName: 'LuxeThread Studio',
        orderNumber: 'ORD-LT-2042',
        customerEmail: 'buyer2@nexora.shop',
        gateway: 'NAGAD',
        gatewayTransactionId: 'NGD-7712041K',
        amount: 4200,
        currency: 'BDT',
        status: 'PENDING',
        paymentMethodDetails: 'Nagad MFS •••• 9901',
        createdAt: new Date(now - 5 * 3600_000),
      },
      {
        tenantId: OFFICIAL_STORE_TENANT_ID,
        tenantName: 'NEXORA Official Store',
        orderNumber: 'ORD-NX-1001',
        customerEmail: 'buyer1@nexora.shop',
        gateway: 'SSLCOMMERZ',
        gatewayTransactionId: 'SSL-9901201N',
        amount: 8500,
        currency: 'BDT',
        status: 'SUCCESS',
        paymentMethodDetails: 'City Bank AMEX •••• 3012',
        settledAt: new Date(now - 4 * 86400_000),
        createdAt: new Date(now - 4 * 86400_000),
      },
      {
        tenantId: DEMO_TENANT_A_ID,
        tenantName: 'UrbanWear BD',
        orderNumber: 'ORD-UW-9003',
        customerEmail: 'buyer2@nexora.shop',
        gateway: 'ROCKET',
        gatewayTransactionId: 'RKT-3301928Z',
        amount: 2150,
        currency: 'BDT',
        status: 'FAILED',
        paymentMethodDetails: 'DBBL Rocket Wallet',
        failureReason: 'Insufficient wallet balance reported by gateway callback',
        createdAt: new Date(now - 10 * 3600_000),
      },
    ];

    if (sandboxPayments.size === 0) {
      const createdPaymentIds: string[] = [];
      for (const p of seedPayments) {
        const id = new Types.ObjectId().toString();
        sandboxPayments.set(id, { ...p, id });
        createdPaymentIds.push(id);
      }

      const r1Id = new Types.ObjectId().toString();
      sandboxRefunds.set(r1Id, {
        id: r1Id,
        tenantId: DEMO_TENANT_A_ID,
        tenantName: 'UrbanWear BD',
        orderNumber: 'ORD-UW-9001',
        paymentId: createdPaymentIds[0],
        gateway: 'BKASH',
        amount: 1200,
        currency: 'BDT',
        reason: 'Partial item return — size exchange unavailable',
        status: 'PENDING',
        createdAt: new Date(now - 6 * 3600_000),
        updatedAt: new Date(now - 6 * 3600_000),
      });

      const r2Id = new Types.ObjectId().toString();
      sandboxRefunds.set(r2Id, {
        id: r2Id,
        tenantId: DEMO_TENANT_B_ID,
        tenantName: 'LuxeThread Studio',
        orderNumber: 'ORD-LT-2038',
        paymentId: createdPaymentIds[2],
        gateway: 'STRIPE',
        amount: 3200,
        currency: 'BDT',
        reason: 'Duplicate card authorization voided',
        status: 'COMPLETED',
        gatewayRefundId: 're_3Q9LuxeRefund01',
        reviewedByEmail: 'finance@nexora.cloud',
        createdAt: new Date(now - 2 * 86400_000),
        updatedAt: new Date(now - 1 * 86400_000),
      });
    }

    // Seed Advertisement Governance Policies per Tenant
    if (sandboxAds.size === 0) {
      const stores = await onboardingRepository.listAllStores();
      for (const s of stores) {
        const isPaid = s.planCode !== 'STARTER';
        sandboxAds.set(s.tenant.id, {
          id: new Types.ObjectId().toString(),
          tenantId: s.tenant.id,
          tenantName: s.tenant.name,
          tenantSlug: s.tenant.slug,
          planCode: s.planCode,
          isEnabled: isPaid,
          publisherId: isPaid ? `ca-pub-nexora-${s.tenant.slug.slice(0, 8)}` : '',
          autoAdsEnabled: false,
          isConsentBannerEnabled: true,
          activeUnitsCount: isPaid ? 3 : 0,
          excludedRoutes: ['/checkout', '/cart', '/account', '/payment', '/orders/confirmed'],
          monthlyImpressions: s.tenant.id === DEMO_TENANT_B_ID ? 84200 : s.tenant.id === DEMO_TENANT_A_ID ? 31450 : 0,
          estimatedRevenueUSD: s.tenant.id === DEMO_TENANT_B_ID ? 142.8 : s.tenant.id === DEMO_TENANT_A_ID ? 48.2 : 0,
          updatedAt: new Date(),
        });
      }
    }

    // Seed Support Tickets
    if (sandboxTickets.size === 0) {
      const t1Id = '6730a840e6c1e95819e96001';
      const t2Id = '6730a840e6c1e95819e96002';
      const t3Id = '6730a840e6c1e95819e96003';
      const initialTickets: SupportTicketRecord[] = [
        {
          id: t1Id,
          ticketNumber: 'TKT-2026-1041',
          tenantId: DEMO_TENANT_A_ID,
          tenantName: 'UrbanWear BD',
          requesterEmail: 'owner@urbanwear.nexora.shop',
          subject: 'SSLCommerz webhook signature verification timeout on checkout',
          category: 'BILLING',
          priority: 'HIGH',
          status: 'OPEN',
          assignedAgentEmail: 'support@nexora.cloud',
          messages: [
            {
              authorEmail: 'owner@urbanwear.nexora.shop',
              authorRole: 'store_owner',
              body: 'Customers paying via SSLCommerz occasionally see delayed IPN callbacks. Requesting scoped webhook diagnostics review.',
              createdAt: new Date(now - 3 * 3600_000),
            },
          ],
          createdAt: new Date(now - 3 * 3600_000),
          updatedAt: new Date(now - 3 * 3600_000),
        },
        {
          id: t2Id,
          ticketNumber: 'TKT-2026-1042',
          tenantId: DEMO_TENANT_B_ID,
          tenantName: 'LuxeThread Studio',
          requesterEmail: 'owner@luxethread.nexora.shop',
          subject: 'Custom domain CNAME verification stuck in pending state',
          category: 'DOMAIN',
          priority: 'MEDIUM',
          status: 'IN_PROGRESS',
          assignedAgentEmail: 'support@nexora.cloud',
          messages: [
            {
              authorEmail: 'owner@luxethread.nexora.shop',
              authorRole: 'store_owner',
              body: 'Pointed luxethread.com.bd to edge.nexora.cloud 4 hours ago; ACME certificate issuance pending.',
              createdAt: new Date(now - 8 * 3600_000),
            },
          ],
          createdAt: new Date(now - 8 * 3600_000),
          updatedAt: new Date(now - 4 * 3600_000),
        },
        {
          id: t3Id,
          ticketNumber: 'TKT-2026-1039',
          tenantId: OFFICIAL_STORE_TENANT_ID,
          tenantName: 'NEXORA Official Store',
          requesterEmail: 'officialstore@nexora.shop',
          subject: 'Requesting inventory CSV import batch quota bump',
          category: 'TECHNICAL',
          priority: 'LOW',
          status: 'RESOLVED',
          assignedAgentEmail: 'support@nexora.cloud',
          messages: [
            {
              authorEmail: 'officialstore@nexora.shop',
              authorRole: 'store_owner',
              body: 'Need temporary batch threshold increase for flagship hardware drop.',
              createdAt: new Date(now - 2 * 86400_000),
            },
          ],
          resolvedAt: new Date(now - 1 * 86400_000),
          createdAt: new Date(now - 2 * 86400_000),
          updatedAt: new Date(now - 1 * 86400_000),
        },
      ];

      for (const tk of initialTickets) {
        if (isDatabaseConnected()) {
          await SupportTicketModel.findOneAndUpdate(
            { ticketNumber: tk.ticketNumber },
            { $setOnInsert: { ...tk, _id: new Types.ObjectId(tk.id) } },
            { upsert: true }
          );
        }
        sandboxTickets.set(tk.id, tk);
      }
    }

    platformBootstrapped = true;
  })();

  try {
    await platformBootstrapPromise;
  } finally {
    platformBootstrapPromise = null;
  }
}

export const platformRepository = {
  async listPayments(): Promise<PlatformPaymentRecord[]> {
    await ensurePlatformBootstrapped();
    if (isDatabaseConnected()) {
      const dbDocs: any[] = await PaymentModel.find({})
        .setOptions({ bypassTenantCheck: true })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();
      if (dbDocs.length > 0) {
        const stores = await onboardingRepository.listAllStores();
        const tenantNameMap = new Map(stores.map((s) => [s.tenant.id, s.tenant.name]));
        return dbDocs.map((p) => ({
          id: p._id.toString(),
          tenantId: p.tenantId.toString(),
          tenantName: tenantNameMap.get(p.tenantId.toString()) || 'Tenant Store',
          orderNumber: `ORD-${p.orderId.toString().slice(-6).toUpperCase()}`,
          customerEmail: 'verified@nexora.shop',
          gateway: p.gateway,
          gatewayTransactionId: p.gatewayTransactionId || p.idempotencyKey,
          amount: p.amount,
          currency: p.currency || 'BDT',
          status: p.status,
          paymentMethodDetails: p.paymentMethodDetails || p.gateway,
          failureReason: p.failureReason,
          settledAt: p.settledAt,
          createdAt: p.createdAt,
        }));
      }
    }
    return Array.from(sandboxPayments.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  },

  async updatePaymentStatus(
    paymentId: string,
    status: TransactionStatus,
    note?: string
  ): Promise<PlatformPaymentRecord | null> {
    await ensurePlatformBootstrapped();
    if (isDatabaseConnected() && Types.ObjectId.isValid(paymentId)) {
      const doc: any = await PaymentModel.findByIdAndUpdate(
        paymentId,
        {
          $set: {
            status,
            ...(status === 'SUCCESS' ? { settledAt: new Date() } : {}),
            ...(note ? { failureReason: note } : {}),
          },
        },
        { returnDocument: 'after' }
      )
        .setOptions({ bypassTenantCheck: true })
        .lean();
      if (doc) {
        return {
          id: doc._id.toString(),
          tenantId: doc.tenantId.toString(),
          tenantName: 'Tenant Store',
          orderNumber: `ORD-${doc.orderId.toString().slice(-6).toUpperCase()}`,
          customerEmail: 'verified@nexora.shop',
          gateway: doc.gateway,
          gatewayTransactionId: doc.gatewayTransactionId || doc.idempotencyKey,
          amount: doc.amount,
          currency: doc.currency || 'BDT',
          status: doc.status,
          paymentMethodDetails: doc.paymentMethodDetails || doc.gateway,
          failureReason: doc.failureReason,
          settledAt: doc.settledAt,
          createdAt: doc.createdAt,
        };
      }
    }
    const rec = sandboxPayments.get(paymentId);
    if (!rec) return null;
    const updated: PlatformPaymentRecord = {
      ...rec,
      status,
      ...(status === 'SUCCESS' ? { settledAt: new Date(), failureReason: undefined } : {}),
      ...(note ? { failureReason: note } : {}),
    };
    sandboxPayments.set(paymentId, updated);
    return { ...updated };
  },

  async listRefunds(): Promise<PlatformRefundRecord[]> {
    await ensurePlatformBootstrapped();
    if (isDatabaseConnected()) {
      const dbDocs: any[] = await RefundModel.find({})
        .setOptions({ bypassTenantCheck: true })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();
      if (dbDocs.length > 0) {
        const stores = await onboardingRepository.listAllStores();
        const tenantNameMap = new Map(stores.map((s) => [s.tenant.id, s.tenant.name]));
        return dbDocs.map((r) => ({
          id: r._id.toString(),
          tenantId: r.tenantId.toString(),
          tenantName: tenantNameMap.get(r.tenantId.toString()) || 'Tenant Store',
          orderNumber: `ORD-${r.orderId.toString().slice(-6).toUpperCase()}`,
          paymentId: r.paymentId.toString(),
          gateway: 'SSLCOMMERZ',
          amount: r.amount,
          currency: 'BDT',
          reason: r.reason,
          status: r.status,
          gatewayRefundId: r.gatewayRefundId,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }));
      }
    }
    return Array.from(sandboxRefunds.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  },

  async updateRefundStatus(
    refundId: string,
    status: 'PENDING' | 'COMPLETED' | 'FAILED',
    reviewedByEmail: string
  ): Promise<PlatformRefundRecord | null> {
    await ensurePlatformBootstrapped();
    const now = new Date();
    const gatewayRefundId =
      status === 'COMPLETED' ? `RFND-${randomUUID().slice(0, 8).toUpperCase()}` : undefined;
    if (isDatabaseConnected() && Types.ObjectId.isValid(refundId)) {
      const doc: any = await RefundModel.findByIdAndUpdate(
        refundId,
        { $set: { status, ...(gatewayRefundId ? { gatewayRefundId } : {}) } },
        { returnDocument: 'after' }
      )
        .setOptions({ bypassTenantCheck: true })
        .lean();
      if (doc) {
        return {
          id: doc._id.toString(),
          tenantId: doc.tenantId.toString(),
          tenantName: 'Tenant Store',
          orderNumber: `ORD-${doc.orderId.toString().slice(-6).toUpperCase()}`,
          paymentId: doc.paymentId.toString(),
          gateway: 'SSLCOMMERZ',
          amount: doc.amount,
          currency: 'BDT',
          reason: doc.reason,
          status: doc.status,
          gatewayRefundId: doc.gatewayRefundId,
          reviewedByEmail,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        };
      }
    }
    const existing = sandboxRefunds.get(refundId);
    if (!existing) return null;
    const updated: PlatformRefundRecord = {
      ...existing,
      status,
      reviewedByEmail,
      ...(gatewayRefundId ? { gatewayRefundId } : {}),
      updatedAt: now,
    };
    sandboxRefunds.set(refundId, updated);
    return { ...updated };
  },

  async listAdvertisementPolicies(): Promise<PlatformAdvertisementRecord[]> {
    await ensurePlatformBootstrapped();
    const stores = await onboardingRepository.listAllStores();
    for (const s of stores) {
      if (!sandboxAds.has(s.tenant.id)) {
        const isPaid = s.planCode !== 'STARTER';
        sandboxAds.set(s.tenant.id, {
          id: new Types.ObjectId().toString(),
          tenantId: s.tenant.id,
          tenantName: s.tenant.name,
          tenantSlug: s.tenant.slug,
          planCode: s.planCode,
          isEnabled: false,
          publisherId: '',
          autoAdsEnabled: false,
          isConsentBannerEnabled: true,
          activeUnitsCount: isPaid ? 1 : 0,
          excludedRoutes: ['/checkout', '/cart', '/account', '/payment', '/orders/confirmed'],
          monthlyImpressions: 0,
          estimatedRevenueUSD: 0,
          updatedAt: new Date(),
        });
      }
    }
    return Array.from(sandboxAds.values());
  },

  async updateAdvertisementPolicy(
    tenantId: string,
    patch: {
      isEnabled?: boolean;
      autoAdsEnabled?: boolean;
      isConsentBannerEnabled?: boolean;
      publisherId?: string;
      excludedRoutes?: string[];
    }
  ): Promise<PlatformAdvertisementRecord | null> {
    await ensurePlatformBootstrapped();
    await this.listAdvertisementPolicies();
    const existing = sandboxAds.get(tenantId);
    if (!existing) return null;

    // ADR-011 Zero-Ad Policy: Sensitive financial routes can NEVER be removed from exclusions
    const mandatoryFinancialExclusions = ['/checkout', '/cart', '/payment', '/orders/confirmed'];
    const mergedExclusions = Array.from(
      new Set([...(patch.excludedRoutes || existing.excludedRoutes), ...mandatoryFinancialExclusions])
    );

    const updated: PlatformAdvertisementRecord = {
      ...existing,
      ...(typeof patch.isEnabled === 'boolean' ? { isEnabled: patch.isEnabled } : {}),
      ...(typeof patch.autoAdsEnabled === 'boolean' ? { autoAdsEnabled: patch.autoAdsEnabled } : {}),
      ...(typeof patch.isConsentBannerEnabled === 'boolean'
        ? { isConsentBannerEnabled: patch.isConsentBannerEnabled }
        : {}),
      ...(typeof patch.publisherId === 'string' ? { publisherId: patch.publisherId } : {}),
      excludedRoutes: mergedExclusions,
      updatedAt: new Date(),
    };
    sandboxAds.set(tenantId, updated);

    if (isDatabaseConnected() && Types.ObjectId.isValid(tenantId)) {
      await AdvertisementModel.findOneAndUpdate(
        { tenantId: new Types.ObjectId(tenantId) },
        {
          $set: {
            isEnabled: updated.isEnabled,
            autoAdsEnabled: updated.autoAdsEnabled,
            isConsentBannerEnabled: updated.isConsentBannerEnabled,
            publisherId: updated.publisherId,
            excludedRoutes: updated.excludedRoutes,
          },
        },
        { upsert: true }
      ).setOptions({ bypassTenantCheck: true });
    }

    return { ...updated };
  },

  async getPlatformBranding(): Promise<PlatformBrandingConfig> {
    await ensurePlatformBootstrapped();
    if (isDatabaseConnected()) {
      const doc: any = await SystemSettingModel.findOne({ key: 'platform.branding' }).lean();
      if (doc?.value) return { ...(doc.value as PlatformBrandingConfig) };
    }
    return { ...sandboxBranding };
  },

  async updatePlatformBranding(
    patch: Partial<PlatformBrandingConfig>,
    actorEmail: string,
    actorUserId: string
  ): Promise<PlatformBrandingConfig> {
    await ensurePlatformBootstrapped();
    const current = await this.getPlatformBranding();
    const updated: PlatformBrandingConfig = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
      updatedByEmail: actorEmail,
    };
    sandboxBranding = updated;
    if (isDatabaseConnected()) {
      await SystemSettingModel.findOneAndUpdate(
        { key: 'platform.branding' },
        {
          $set: {
            value: updated,
            updatedByUserId: Types.ObjectId.isValid(actorUserId)
              ? new Types.ObjectId(actorUserId)
              : undefined,
          },
        },
        { upsert: true }
      );
    }
    return { ...updated };
  },

  async listGlobalSettings(): Promise<GlobalSettingItem[]> {
    await ensurePlatformBootstrapped();
    if (isDatabaseConnected()) {
      const docs: any[] = await SystemSettingModel.find({ key: { $ne: 'platform.branding' } })
        .sort({ category: 1, key: 1 })
        .lean();
      if (docs.length > 0) {
        return docs.map((d) => {
          const val = d.value as string | number | boolean;
          const vt: 'boolean' | 'number' | 'string' =
            typeof val === 'boolean' ? 'boolean' : typeof val === 'number' ? 'number' : 'string';
          return {
            key: d.key,
            value: val,
            valueType: vt,
            description: d.description,
            category: d.category,
            isPublic: Boolean(d.isPublic),
            updatedAt: (d.updatedAt || new Date()).toISOString(),
          };
        });
      }
    }
    return Array.from(sandboxGlobalSettings.values()).map((s) => ({ ...s }));
  },

  async updateGlobalSetting(
    key: string,
    value: string | number | boolean,
    actorEmail: string,
    actorUserId: string
  ): Promise<GlobalSettingItem | null> {
    await ensurePlatformBootstrapped();
    const existing = sandboxGlobalSettings.get(key);
    if (!existing && !isDatabaseConnected()) return null;

    const nowIso = new Date().toISOString();
    if (existing) {
      const updated: GlobalSettingItem = {
        ...existing,
        value,
        updatedAt: nowIso,
        updatedByEmail: actorEmail,
      };
      sandboxGlobalSettings.set(key, updated);
    }

    if (isDatabaseConnected()) {
      const doc: any = await SystemSettingModel.findOneAndUpdate(
        { key },
        {
          $set: {
            value,
            updatedByUserId: Types.ObjectId.isValid(actorUserId)
              ? new Types.ObjectId(actorUserId)
              : undefined,
          },
        },
        { returnDocument: 'after' }
      ).lean();
      if (!doc && !existing) return null;
      if (doc) {
        return {
          key: doc.key,
          value: doc.value,
          valueType: typeof doc.value === 'boolean' ? 'boolean' : typeof doc.value === 'number' ? 'number' : 'string',
          description: doc.description,
          category: doc.category,
          isPublic: Boolean(doc.isPublic),
          updatedAt: nowIso,
          updatedByEmail: actorEmail,
        };
      }
    }
    return existing ? { ...sandboxGlobalSettings.get(key)! } : null;
  },

  async getStorageUsedForTenant(tenantId: string): Promise<number> {
    await ensurePlatformBootstrapped();
    return sandboxStorageUsedMB.get(tenantId) ?? 42;
  },

  // ---------- SUPPORT TICKETS ----------
  async listSupportTickets(): Promise<SupportTicketRecord[]> {
    await ensurePlatformBootstrapped();
    if (isDatabaseConnected()) {
      const docs: any[] = await SupportTicketModel.find({}).sort({ updatedAt: -1 }).lean();
      if (docs.length > 0) {
        return docs.map((d) => ({
          id: d._id.toString(),
          ticketNumber: d.ticketNumber,
          tenantId: d.tenantId,
          tenantName: d.tenantName,
          requesterEmail: d.requesterEmail,
          subject: d.subject,
          category: d.category,
          priority: d.priority,
          status: d.status,
          assignedAgentEmail: d.assignedAgentEmail,
          messages: d.messages || [],
          resolvedAt: d.resolvedAt,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        }));
      }
    }
    return Array.from(sandboxTickets.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  },

  async findSupportTicketById(ticketId: string): Promise<SupportTicketRecord | null> {
    await ensurePlatformBootstrapped();
    if (isDatabaseConnected() && Types.ObjectId.isValid(ticketId)) {
      const doc: any = await SupportTicketModel.findById(ticketId).lean();
      if (doc) {
        return {
          id: doc._id.toString(),
          ticketNumber: doc.ticketNumber,
          tenantId: doc.tenantId,
          tenantName: doc.tenantName,
          requesterEmail: doc.requesterEmail,
          subject: doc.subject,
          category: doc.category,
          priority: doc.priority,
          status: doc.status,
          assignedAgentEmail: doc.assignedAgentEmail,
          messages: doc.messages || [],
          resolvedAt: doc.resolvedAt,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        };
      }
    }
    const tk = sandboxTickets.get(ticketId);
    return tk ? { ...tk, messages: [...tk.messages] } : null;
  },

  async updateSupportTicket(
    ticketId: string,
    patch: {
      status?: SupportTicketStatus;
      priority?: SupportTicketPriority;
      replyBody?: string;
      actorEmail: string;
      actorRole: string;
    }
  ): Promise<SupportTicketRecord | null> {
    await ensurePlatformBootstrapped();
    const now = new Date();
    const existing = await this.findSupportTicketById(ticketId);
    if (!existing) return null;

    const updatedMessages = [...existing.messages];
    if (patch.replyBody?.trim()) {
      updatedMessages.push({
        authorEmail: patch.actorEmail,
        authorRole: patch.actorRole,
        body: patch.replyBody.trim(),
        createdAt: now,
      });
    }

    const nextStatus = patch.status || existing.status;
    const resolvedAt =
      nextStatus === 'RESOLVED' || nextStatus === 'CLOSED'
        ? existing.resolvedAt || now
        : undefined;

    if (isDatabaseConnected() && Types.ObjectId.isValid(ticketId)) {
      await SupportTicketModel.updateOne(
        { _id: new Types.ObjectId(ticketId) },
        {
          $set: {
            status: nextStatus,
            priority: patch.priority || existing.priority,
            assignedAgentEmail: patch.actorEmail,
            messages: updatedMessages,
            ...(resolvedAt ? { resolvedAt } : {}),
          },
        }
      );
    }

    const updated: SupportTicketRecord = {
      ...existing,
      status: nextStatus,
      priority: patch.priority || existing.priority,
      assignedAgentEmail: patch.actorEmail,
      messages: updatedMessages,
      resolvedAt,
      updatedAt: now,
    };
    sandboxTickets.set(ticketId, updated);
    return { ...updated };
  },

  // ---------- CONTROLLED SUPPORT ACCESS GRANTS ----------
  async listSupportAccessGrants(): Promise<SupportAccessGrantRecord[]> {
    await ensurePlatformBootstrapped();
    const now = new Date();
    const expireIfNeeded = (g: SupportAccessGrantRecord): SupportAccessGrantRecord => {
      if (g.status === 'ACTIVE' && g.expiresAt <= now) {
        return { ...g, status: 'EXPIRED' };
      }
      return g;
    };

    if (isDatabaseConnected()) {
      const docs: any[] = await SupportAccessGrantModel.find({}).sort({ grantedAt: -1 }).limit(100).lean();
      if (docs.length > 0) {
        return docs.map((d) =>
          expireIfNeeded({
            id: d._id.toString(),
            grantId: d.grantId,
            ticketId: d.ticketId,
            ticketNumber: d.ticketNumber,
            tenantId: d.tenantId,
            tenantName: d.tenantName,
            actorUserId: d.actorUserId,
            actorEmail: d.actorEmail,
            actorRole: d.actorRole,
            accessScope: d.accessScope,
            reason: d.reason,
            status: d.status,
            grantedAt: d.grantedAt,
            expiresAt: d.expiresAt,
            revokedAt: d.revokedAt,
            revokedByEmail: d.revokedByEmail,
            accessCount: d.accessCount ?? 0,
            lastAccessedAt: d.lastAccessedAt,
          })
        );
      }
    }

    return Array.from(sandboxSupportGrants.values())
      .map(expireIfNeeded)
      .sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime());
  },

  async createSupportAccessGrant(
    input: Omit<SupportAccessGrantRecord, 'id' | 'grantId' | 'status' | 'grantedAt' | 'accessCount'>
  ): Promise<SupportAccessGrantRecord> {
    await ensurePlatformBootstrapped();
    const now = new Date();
    const grantId = `sup_${randomUUID().slice(0, 12)}`;
    const id = new Types.ObjectId().toString();
    const record: SupportAccessGrantRecord = {
      ...input,
      id,
      grantId,
      status: 'ACTIVE',
      grantedAt: now,
      accessCount: 0,
    };

    if (isDatabaseConnected()) {
      await SupportAccessGrantModel.create({
        _id: new Types.ObjectId(id),
        ...record,
      });
    }
    sandboxSupportGrants.set(grantId, record);
    return { ...record };
  },

  async findActiveSupportGrant(
    actorUserId: string,
    tenantId: string
  ): Promise<{ grant: SupportAccessGrantRecord | null; expiredFound: boolean }> {
    await ensurePlatformBootstrapped();
    const grants = await this.listSupportAccessGrants();
    const matching = grants.filter((g) => g.actorUserId === actorUserId && g.tenantId === tenantId);
    const active = matching.find((g) => g.status === 'ACTIVE' && g.expiresAt > new Date());
    if (active) return { grant: active, expiredFound: false };
    const expiredFound = matching.some((g) => g.status === 'EXPIRED');
    return { grant: null, expiredFound };
  },

  async recordSupportGrantAccess(grantId: string): Promise<void> {
    const now = new Date();
    const g = sandboxSupportGrants.get(grantId);
    if (g) {
      g.accessCount += 1;
      g.lastAccessedAt = now;
    }
    if (isDatabaseConnected()) {
      await SupportAccessGrantModel.updateOne(
        { grantId },
        { $inc: { accessCount: 1 }, $set: { lastAccessedAt: now } }
      );
    }
  },

  async revokeSupportAccessGrant(
    grantId: string,
    revokedByEmail: string
  ): Promise<SupportAccessGrantRecord | null> {
    await ensurePlatformBootstrapped();
    const now = new Date();
    if (isDatabaseConnected()) {
      await SupportAccessGrantModel.updateOne(
        { grantId },
        { $set: { status: 'REVOKED', revokedAt: now, revokedByEmail } }
      );
    }
    const existing = sandboxSupportGrants.get(grantId);
    if (existing) {
      existing.status = 'REVOKED';
      existing.revokedAt = now;
      existing.revokedByEmail = revokedByEmail;
      return { ...existing };
    }
    const all = await this.listSupportAccessGrants();
    return all.find((g) => g.grantId === grantId) || null;
  },

  async expireGrantForTesting(grantId: string): Promise<void> {
    const past = new Date(Date.now() - 60_000);
    const g = sandboxSupportGrants.get(grantId);
    if (g) {
      g.expiresAt = past;
    }
    if (isDatabaseConnected()) {
      await SupportAccessGrantModel.updateOne({ grantId }, { $set: { expiresAt: past } });
    }
  },

  async getRedactedTenantSupportDiagnostics(
    tenantId: string,
    scope: SupportAccessScope
  ): Promise<Record<string, unknown>> {
    const bundle = await onboardingRepository.getProvisionedBundle(tenantId);
    const orders = await rbacRepository.listTenantOrders(tenantId);
    const products = await rbacRepository.listTenantProducts(tenantId);

    const redactedOrders =
      scope === 'ORDER_ASSIST'
        ? orders.map((o) => ({
            orderNumber: o.orderNumber,
            status: o.status,
            totalBDT: o.totalBDT,
            // PII redacted cleanly (shows only domain hint)
            customerMasked: o.customerEmail.replace(/(^.).*(@.*$)/, '$1***$2'),
            createdAt: o.createdAt,
          }))
        : [];

    return {
      tenantId,
      storeSlug: bundle?.store.slug,
      storeStatus: bundle?.store.status,
      currency: bundle?.store.currency,
      timezone: bundle?.store.timezone,
      catalogCount: products.length,
      ordersCount: orders.length,
      accessScope: scope,
      piiAndSecretsRedacted: true,
      redactedOrders,
    };
  },
};
