/**
 * NEXORA RBAC & Tenant Resource Dual-Mode Repository
 * Persists to MongoDB via Mongoose when connected, or uses an isolated
 * in-memory store with deterministic multi-tenant demo fixtures in sandbox mode.
 */

import { Types } from 'mongoose';
import { isDatabaseConnected } from '../config/database.ts';
import { hashPassword } from '../security/password.ts';
import { authRepository } from '../auth/authRepository.ts';
import {
  UserModel,
  TenantModel,
  StoreModel,
  RoleModel,
  StoreMembershipModel,
  StaffInvitationModel,
  AdminActivityLogModel,
  ProductModel,
  OrderModel,
  type UserType,
  type AdminActivityAction,
} from '../db/models.ts';
import {
  ROLE_DEFINITIONS,
  type TenantRoleSlug,
} from './permissions.ts';

export interface RbacTenantRecord {
  id: string;
  name: string;
  slug: string;
  subdomain: string;
  storeId: string;
  ownerUserId: string;
  status: string;
}

export interface TenantRoleRecord {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string;
  permissionCodes: string[];
  hierarchyRank: number;
  isSystemDefault: boolean;
}

export interface StoreMembershipRecord {
  id: string;
  tenantId: string;
  storeId: string;
  userId: string;
  userEmail: string;
  userFullName: string;
  roleId: string;
  roleSlug: string;
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'REVOKED';
  invitedBy?: string;
  revokedAt?: Date;
  revokedBy?: string;
  joinedAt: Date;
}

export interface StaffInvitationRecord {
  id: string;
  tenantId: string;
  storeId: string;
  email: string;
  roleSlug: string;
  tokenHash: string;
  invitedByUserId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  expiresAt: Date;
  acceptedAt?: Date;
  acceptedByUserId?: string;
  createdAt: Date;
}

export interface TenantProductRecord {
  id: string;
  tenantId: string;
  title: string;
  sku: string;
  priceBDT: number;
  stockQty: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  createdByUserId: string;
  updatedAt: Date;
}

export interface TenantOrderRecord {
  id: string;
  tenantId: string;
  orderNumber: string;
  customerUserId: string;
  customerEmail: string;
  totalBDT: number;
  status: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';
  itemsSummary: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminActivityLogRecord {
  id: string;
  scope: 'PLATFORM' | 'TENANT' | 'STOREFRONT';
  tenantId?: string;
  actorUserId?: string;
  actorEmail?: string;
  actorRole: string;
  action: AdminActivityAction;
  resourceType: string;
  resourceId?: string;
  outcome: 'ALLOWED' | 'DENIED';
  reason?: string;
  ipAddress: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// ==========================================
// SANDBOX IN-MEMORY STORES
// ==========================================
const sandboxTenants = new Map<string, RbacTenantRecord>();
const sandboxTenantRoles = new Map<string, TenantRoleRecord>(); // key: `${tenantId}:${slug}`
const sandboxMemberships = new Map<string, StoreMembershipRecord>(); // key: `${tenantId}:${userId}`
const sandboxInvitations = new Map<string, StaffInvitationRecord>(); // key: id
const sandboxProducts = new Map<string, TenantProductRecord>(); // key: id
const sandboxOrders = new Map<string, TenantOrderRecord>(); // key: id
const sandboxActivityLogs: AdminActivityLogRecord[] = [];
const sandboxPlatformUsers = new Map<string, { id: string; email: string; fullName: string; userType: UserType; status: string }>();

let bootstrapPromise: Promise<void> | null = null;
let bootstrapped = false;

export const DEMO_TENANT_A_ID = '6730a840e6c1e95819e92001';
export const DEMO_TENANT_B_ID = '6730a840e6c1e95819e92002';
const DEMO_STORE_A_ID = '6730a840e6c1e95819e93001';
const DEMO_STORE_B_ID = '6730a840e6c1e95819e93002';

export async function ensureRbacBootstrapped(): Promise<void> {
  if (bootstrapped) return;
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    const demoPasswordHash = await hashPassword('NexoraDemo!2026');

    const ensureSandboxOrDbUser = async (spec: {
      email: string;
      fullName: string;
      userType: UserType;
    }) => {
      let user = await authRepository.findUserByEmail(spec.email);
      if (!user) {
        user = await authRepository.createUser({
          email: spec.email,
          fullName: spec.fullName,
          passwordHash: demoPasswordHash,
          userType: spec.userType,
          status: 'ACTIVE',
        });
        await authRepository.updateUser(user.id, {
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        });
      }
      sandboxPlatformUsers.set(user.id, {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        userType: user.userType,
        status: 'ACTIVE',
      });
      return user;
    };

    const superAdmin = await ensureSandboxOrDbUser({
      email: 'superadmin@nexora.cloud',
      fullName: 'Tariq Mahmud (Super Admin)',
      userType: 'PLATFORM_SUPER_ADMIN',
    });
    await ensureSandboxOrDbUser({
      email: 'finance@nexora.cloud',
      fullName: 'Nadia Rahman (Finance Manager)',
      userType: 'PLATFORM_FINANCE_MANAGER',
    });
    await ensureSandboxOrDbUser({
      email: 'support@nexora.cloud',
      fullName: 'Rafiq Hasan (Support Agent)',
      userType: 'PLATFORM_SUPPORT_AGENT',
    });
    const ownerA = await ensureSandboxOrDbUser({
      email: 'owner@urbanwear.nexora.shop',
      fullName: 'Al-Amin Adnan (UrbanWear Owner)',
      userType: 'MERCHANT',
    });
    const productMgrA = await ensureSandboxOrDbUser({
      email: 'catalog@urbanwear.nexora.shop',
      fullName: 'Sadia Islam (Product Manager)',
      userType: 'MERCHANT',
    });
    const ownerB = await ensureSandboxOrDbUser({
      email: 'owner@luxethread.nexora.shop',
      fullName: 'Karim Chowdhury (LuxeThread Owner)',
      userType: 'MERCHANT',
    });
    const customerA = await ensureSandboxOrDbUser({
      email: 'buyer1@nexora.shop',
      fullName: 'Farhana Akter (Customer A)',
      userType: 'CUSTOMER',
    });
    const customerB = await ensureSandboxOrDbUser({
      email: 'buyer2@nexora.shop',
      fullName: 'Imran Hossain (Customer B)',
      userType: 'CUSTOMER',
    });

    if (!isDatabaseConnected()) {
      // Seed 2 isolated tenants
      sandboxTenants.set(DEMO_TENANT_A_ID, {
        id: DEMO_TENANT_A_ID,
        name: 'UrbanWear BD',
        slug: 'urbanwear',
        subdomain: 'urbanwear',
        storeId: DEMO_STORE_A_ID,
        ownerUserId: ownerA.id,
        status: 'ACTIVE',
      });
      sandboxTenants.set(DEMO_TENANT_B_ID, {
        id: DEMO_TENANT_B_ID,
        name: 'LuxeThread Studio',
        slug: 'luxethread',
        subdomain: 'luxethread',
        storeId: DEMO_STORE_B_ID,
        ownerUserId: ownerB.id,
        status: 'ACTIVE',
      });

      // Seed default 8 tenant roles per tenant
      for (const tenantId of [DEMO_TENANT_A_ID, DEMO_TENANT_B_ID]) {
        for (const roleDef of ROLE_DEFINITIONS.filter((r) => r.scope === 'TENANT')) {
          const roleId = new Types.ObjectId().toString();
          sandboxTenantRoles.set(`${tenantId}:${roleDef.slug}`, {
            id: roleId,
            tenantId,
            name: roleDef.name,
            slug: roleDef.slug,
            description: roleDef.description,
            permissionCodes: [...roleDef.permissionCodes],
            hierarchyRank: roleDef.hierarchyRank,
            isSystemDefault: true,
          });
        }
      }

      // Seed memberships
      const assignDemoMember = (tenantId: string, storeId: string, u: typeof ownerA, slug: TenantRoleSlug) => {
        const role = sandboxTenantRoles.get(`${tenantId}:${slug}`)!;
        sandboxMemberships.set(`${tenantId}:${u.id}`, {
          id: new Types.ObjectId().toString(),
          tenantId,
          storeId,
          userId: u.id,
          userEmail: u.email,
          userFullName: u.fullName,
          roleId: role.id,
          roleSlug: slug,
          status: 'ACTIVE',
          joinedAt: new Date(),
        });
      };

      assignDemoMember(DEMO_TENANT_A_ID, DEMO_STORE_A_ID, ownerA, 'store_owner');
      assignDemoMember(DEMO_TENANT_A_ID, DEMO_STORE_A_ID, productMgrA, 'product_manager');
      assignDemoMember(DEMO_TENANT_B_ID, DEMO_STORE_B_ID, ownerB, 'store_owner');

      // Seed isolated products
      const prodA1: TenantProductRecord = {
        id: 'prod_uw_101',
        tenantId: DEMO_TENANT_A_ID,
        title: 'Dhaka Heritage Linen Overshirt',
        sku: 'UW-LIN-101',
        priceBDT: 2450,
        stockQty: 42,
        status: 'PUBLISHED',
        createdByUserId: productMgrA.id,
        updatedAt: new Date(),
      };
      const prodB1: TenantProductRecord = {
        id: 'prod_lt_201',
        tenantId: DEMO_TENANT_B_ID,
        title: 'Sylhet Silk Evening Kurta',
        sku: 'LT-SLK-201',
        priceBDT: 5800,
        stockQty: 18,
        status: 'PUBLISHED',
        createdByUserId: ownerB.id,
        updatedAt: new Date(),
      };
      sandboxProducts.set(prodA1.id, prodA1);
      sandboxProducts.set(prodB1.id, prodB1);

      // Seed isolated customer orders (to test IDOR & cross-tenant isolation)
      const ordA1: TenantOrderRecord = {
        id: 'ord_uw_9001',
        tenantId: DEMO_TENANT_A_ID,
        orderNumber: 'UW-2026-9001',
        customerUserId: customerA.id,
        customerEmail: customerA.email,
        totalBDT: 2450,
        status: 'PENDING',
        itemsSummary: '1x Dhaka Heritage Linen Overshirt',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const ordA2: TenantOrderRecord = {
        id: 'ord_uw_9002',
        tenantId: DEMO_TENANT_A_ID,
        orderNumber: 'UW-2026-9002',
        customerUserId: customerB.id,
        customerEmail: customerB.email,
        totalBDT: 4900,
        status: 'PROCESSING',
        itemsSummary: '2x Dhaka Heritage Linen Overshirt',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const ordB1: TenantOrderRecord = {
        id: 'ord_lt_8001',
        tenantId: DEMO_TENANT_B_ID,
        orderNumber: 'LT-2026-8001',
        customerUserId: customerA.id,
        customerEmail: customerA.email,
        totalBDT: 5800,
        status: 'PENDING',
        itemsSummary: '1x Sylhet Silk Evening Kurta',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      sandboxOrders.set(ordA1.id, ordA1);
      sandboxOrders.set(ordA2.id, ordA2);
      sandboxOrders.set(ordB1.id, ordB1);

      sandboxActivityLogs.push({
        id: new Types.ObjectId().toString(),
        scope: 'PLATFORM',
        actorUserId: superAdmin.id,
        actorEmail: superAdmin.email,
        actorRole: 'super_admin',
        action: 'PLATFORM_ROLE_ASSIGNED',
        resourceType: 'User',
        resourceId: superAdmin.id,
        outcome: 'ALLOWED',
        reason: 'Initialized default 14-role NEXORA RBAC baseline.',
        ipAddress: '127.0.0.1',
        createdAt: new Date(),
      });
    }

    bootstrapped = true;
  })();

  await bootstrapPromise;
}

export const rbacRepository = {
  // ---------- TENANTS ----------
  async listTenants(): Promise<RbacTenantRecord[]> {
    await ensureRbacBootstrapped();
    if (isDatabaseConnected()) {
      const tenants = await TenantModel.find({ isDeleted: { $ne: true } }).lean();
      const stores = await StoreModel.find({}).lean();
      const storeByTenant = new Map(stores.map((s) => [s.tenantId.toString(), s._id.toString()]));
      return tenants.map((t) => ({
        id: t._id.toString(),
        name: t.name,
        slug: t.slug,
        subdomain: t.subdomain,
        storeId: storeByTenant.get(t._id.toString()) || t._id.toString(),
        ownerUserId: t.ownerUserId.toString(),
        status: t.status,
      }));
    }
    return Array.from(sandboxTenants.values());
  },

  async findTenantById(tenantId: string): Promise<RbacTenantRecord | null> {
    await ensureRbacBootstrapped();
    if (isDatabaseConnected()) {
      if (!Types.ObjectId.isValid(tenantId)) return null;
      const t = await TenantModel.findById(tenantId).lean();
      if (!t) return null;
      const s = await StoreModel.findOne({ tenantId: t._id }).setOptions({ bypassTenantCheck: true }).lean();
      return {
        id: t._id.toString(),
        name: t.name,
        slug: t.slug,
        subdomain: t.subdomain,
        storeId: s?._id.toString() || t._id.toString(),
        ownerUserId: t.ownerUserId.toString(),
        status: t.status,
      };
    }
    return sandboxTenants.get(tenantId) || null;
  },

  async createTenant(input: {
    name: string;
    slug: string;
    ownerUserId: string;
    ownerEmail: string;
    ownerFullName: string;
  }): Promise<RbacTenantRecord> {
    await ensureRbacBootstrapped();
    const id = new Types.ObjectId().toString();
    const storeId = new Types.ObjectId().toString();

    if (isDatabaseConnected()) {
      const tenantDoc = await TenantModel.create({
        _id: new Types.ObjectId(id),
        name: input.name,
        slug: input.slug,
        subdomain: input.slug,
        ownerUserId: new Types.ObjectId(input.ownerUserId),
        contactEmail: input.ownerEmail,
        status: 'ACTIVE',
      });
      await StoreModel.create({
        _id: new Types.ObjectId(storeId),
        tenantId: tenantDoc._id,
        name: input.name,
        slug: input.slug,
        contactEmail: input.ownerEmail,
      });
    } else {
      sandboxTenants.set(id, {
        id,
        name: input.name,
        slug: input.slug,
        subdomain: input.slug,
        storeId,
        ownerUserId: input.ownerUserId,
        status: 'ACTIVE',
      });
    }

    // Provision default 8 tenant roles & assign store_owner to creator
    for (const def of ROLE_DEFINITIONS.filter((r) => r.scope === 'TENANT')) {
      await this.upsertTenantRole({
        tenantId: id,
        name: def.name,
        slug: def.slug,
        description: def.description,
        permissionCodes: [...def.permissionCodes],
        hierarchyRank: def.hierarchyRank,
        isSystemDefault: true,
      });
    }
    const ownerRole = await this.findTenantRole(id, 'store_owner');
    if (ownerRole) {
      await this.upsertMembership({
        tenantId: id,
        storeId,
        userId: input.ownerUserId,
        userEmail: input.ownerEmail,
        userFullName: input.ownerFullName,
        roleId: ownerRole.id,
        roleSlug: 'store_owner',
      });
    }

    return {
      id,
      name: input.name,
      slug: input.slug,
      subdomain: input.slug,
      storeId,
      ownerUserId: input.ownerUserId,
      status: 'ACTIVE',
    };
  },

  // ---------- ROLES ----------
  async listTenantRoles(tenantId: string): Promise<TenantRoleRecord[]> {
    await ensureRbacBootstrapped();
    if (isDatabaseConnected()) {
      const docs = await RoleModel.find({ tenantId: new Types.ObjectId(tenantId) })
        .setOptions({ bypassTenantCheck: true })
        .lean();
      if (docs.length === 0) {
        for (const def of ROLE_DEFINITIONS.filter((r) => r.scope === 'TENANT')) {
          await this.upsertTenantRole({
            tenantId,
            name: def.name,
            slug: def.slug,
            description: def.description,
            permissionCodes: [...def.permissionCodes],
            hierarchyRank: def.hierarchyRank,
            isSystemDefault: true,
          });
        }
        return this.listTenantRoles(tenantId);
      }
      return docs.map((d) => ({
        id: d._id.toString(),
        tenantId: d.tenantId.toString(),
        name: d.name,
        slug: d.slug,
        description: d.description || '',
        permissionCodes: [...d.permissionCodes],
        hierarchyRank: d.hierarchyRank ?? 30,
        isSystemDefault: Boolean(d.isSystemDefault),
      }));
    }

    const out: TenantRoleRecord[] = [];
    for (const r of sandboxTenantRoles.values()) {
      if (r.tenantId === tenantId) out.push({ ...r, permissionCodes: [...r.permissionCodes] });
    }
    return out.sort((a, b) => b.hierarchyRank - a.hierarchyRank);
  },

  async findTenantRole(tenantId: string, slug: string): Promise<TenantRoleRecord | null> {
    await ensureRbacBootstrapped();
    const normalized = slug.trim().toLowerCase();
    if (isDatabaseConnected()) {
      const doc = await RoleModel.findOne({ tenantId: new Types.ObjectId(tenantId), slug: normalized })
        .setOptions({ bypassTenantCheck: true })
        .lean();
      if (!doc) return null;
      return {
        id: doc._id.toString(),
        tenantId: doc.tenantId.toString(),
        name: doc.name,
        slug: doc.slug,
        description: doc.description || '',
        permissionCodes: [...doc.permissionCodes],
        hierarchyRank: doc.hierarchyRank ?? 30,
        isSystemDefault: Boolean(doc.isSystemDefault),
      };
    }

    const found = sandboxTenantRoles.get(`${tenantId}:${normalized}`);
    return found ? { ...found, permissionCodes: [...found.permissionCodes] } : null;
  },

  async upsertTenantRole(input: {
    tenantId: string;
    name: string;
    slug: string;
    description: string;
    permissionCodes: string[];
    hierarchyRank: number;
    isSystemDefault: boolean;
  }): Promise<TenantRoleRecord> {
    const slug = input.slug.trim().toLowerCase();
    if (isDatabaseConnected()) {
      const doc: any = await RoleModel.findOneAndUpdate(
        { tenantId: new Types.ObjectId(input.tenantId), slug },
        {
          $set: {
            tenantId: new Types.ObjectId(input.tenantId),
            name: input.name,
            slug,
            description: input.description,
            permissionCodes: input.permissionCodes,
            hierarchyRank: input.hierarchyRank,
            isSystemDefault: input.isSystemDefault,
          },
        },
        { upsert: true, returnDocument: 'after', bypassTenantCheck: true } as any
      ).lean();
      return {
        id: doc!._id.toString(),
        tenantId: doc!.tenantId.toString(),
        name: doc!.name,
        slug: doc!.slug,
        description: doc!.description || '',
        permissionCodes: [...doc!.permissionCodes],
        hierarchyRank: doc!.hierarchyRank ?? input.hierarchyRank,
        isSystemDefault: Boolean(doc!.isSystemDefault),
      };
    }

    const key = `${input.tenantId}:${slug}`;
    const existing = sandboxTenantRoles.get(key);
    const rec: TenantRoleRecord = {
      id: existing?.id || new Types.ObjectId().toString(),
      tenantId: input.tenantId,
      name: input.name,
      slug,
      description: input.description,
      permissionCodes: [...input.permissionCodes],
      hierarchyRank: input.hierarchyRank,
      isSystemDefault: existing?.isSystemDefault ?? input.isSystemDefault,
    };
    sandboxTenantRoles.set(key, rec);
    return { ...rec, permissionCodes: [...rec.permissionCodes] };
  },

  // ---------- MEMBERSHIPS ----------
  async listTenantMemberships(tenantId: string): Promise<StoreMembershipRecord[]> {
    await ensureRbacBootstrapped();
    if (isDatabaseConnected()) {
      const docs = await StoreMembershipModel.find({ tenantId: new Types.ObjectId(tenantId) })
        .setOptions({ bypassTenantCheck: true })
        .populate('userId', 'email fullName')
        .lean();
      return docs.map((d: any) => ({
        id: d._id.toString(),
        tenantId: d.tenantId.toString(),
        storeId: d.storeId.toString(),
        userId: d.userId?._id?.toString() || d.userId.toString(),
        userEmail: d.userId?.email || 'unknown@nexora.shop',
        userFullName: d.userId?.fullName || 'Store Member',
        roleId: d.roleId.toString(),
        roleSlug: d.roleSlug,
        status: d.status,
        invitedBy: d.invitedBy?.toString(),
        revokedAt: d.revokedAt,
        revokedBy: d.revokedBy?.toString(),
        joinedAt: d.joinedAt,
      }));
    }

    return Array.from(sandboxMemberships.values())
      .filter((m) => m.tenantId === tenantId)
      .map((m) => ({ ...m }));
  },

  async findMembership(tenantId: string, userId: string): Promise<StoreMembershipRecord | null> {
    await ensureRbacBootstrapped();
    if (isDatabaseConnected()) {
      if (!Types.ObjectId.isValid(tenantId) || !Types.ObjectId.isValid(userId)) return null;
      const doc: any = await StoreMembershipModel.findOne({
        tenantId: new Types.ObjectId(tenantId),
        userId: new Types.ObjectId(userId),
      })
        .setOptions({ bypassTenantCheck: true })
        .populate('userId', 'email fullName')
        .lean();
      if (!doc) return null;
      return {
        id: doc._id.toString(),
        tenantId: doc.tenantId.toString(),
        storeId: doc.storeId.toString(),
        userId: doc.userId?._id?.toString() || doc.userId.toString(),
        userEmail: doc.userId?.email || '',
        userFullName: doc.userId?.fullName || '',
        roleId: doc.roleId.toString(),
        roleSlug: doc.roleSlug,
        status: doc.status,
        invitedBy: doc.invitedBy?.toString(),
        revokedAt: doc.revokedAt,
        revokedBy: doc.revokedBy?.toString(),
        joinedAt: doc.joinedAt,
      };
    }

    const found = sandboxMemberships.get(`${tenantId}:${userId}`);
    return found ? { ...found } : null;
  },

  async upsertMembership(input: {
    tenantId: string;
    storeId: string;
    userId: string;
    userEmail: string;
    userFullName: string;
    roleId: string;
    roleSlug: string;
    invitedBy?: string;
  }): Promise<StoreMembershipRecord> {
    if (isDatabaseConnected()) {
      const doc: any = await StoreMembershipModel.findOneAndUpdate(
        {
          tenantId: new Types.ObjectId(input.tenantId),
          userId: new Types.ObjectId(input.userId),
          storeId: new Types.ObjectId(input.storeId),
        },
        {
          $set: {
            roleId: new Types.ObjectId(input.roleId),
            roleSlug: input.roleSlug.toLowerCase(),
            status: 'ACTIVE',
            invitedBy: input.invitedBy ? new Types.ObjectId(input.invitedBy) : undefined,
            joinedAt: new Date(),
          },
          $unset: { revokedAt: '', revokedBy: '' },
        },
        { upsert: true, returnDocument: 'after', bypassTenantCheck: true } as any
      ).lean();

      return {
        id: doc!._id.toString(),
        tenantId: input.tenantId,
        storeId: input.storeId,
        userId: input.userId,
        userEmail: input.userEmail,
        userFullName: input.userFullName,
        roleId: input.roleId,
        roleSlug: input.roleSlug.toLowerCase(),
        status: 'ACTIVE',
        invitedBy: input.invitedBy,
        joinedAt: doc!.joinedAt,
      };
    }

    const rec: StoreMembershipRecord = {
      id: sandboxMemberships.get(`${input.tenantId}:${input.userId}`)?.id || new Types.ObjectId().toString(),
      tenantId: input.tenantId,
      storeId: input.storeId,
      userId: input.userId,
      userEmail: input.userEmail,
      userFullName: input.userFullName,
      roleId: input.roleId,
      roleSlug: input.roleSlug.toLowerCase(),
      status: 'ACTIVE',
      invitedBy: input.invitedBy,
      joinedAt: new Date(),
    };
    sandboxMemberships.set(`${input.tenantId}:${input.userId}`, rec);
    return { ...rec };
  },

  async revokeMembership(tenantId: string, userId: string, revokedByUserId: string): Promise<boolean> {
    const now = new Date();
    if (isDatabaseConnected()) {
      const res = await StoreMembershipModel.updateOne(
        { tenantId: new Types.ObjectId(tenantId), userId: new Types.ObjectId(userId), status: 'ACTIVE' },
        { $set: { status: 'REVOKED', revokedAt: now, revokedBy: new Types.ObjectId(revokedByUserId) } },
        { bypassTenantCheck: true } as any
      );
      return res.modifiedCount > 0;
    }

    const existing = sandboxMemberships.get(`${tenantId}:${userId}`);
    if (!existing || existing.status !== 'ACTIVE') return false;
    existing.status = 'REVOKED';
    existing.revokedAt = now;
    existing.revokedBy = revokedByUserId;
    return true;
  },

  // ---------- STAFF INVITATIONS ----------
  async createInvitation(input: {
    tenantId: string;
    storeId: string;
    email: string;
    roleSlug: string;
    tokenHash: string;
    invitedByUserId: string;
    expiresAt: Date;
  }): Promise<StaffInvitationRecord> {
    if (isDatabaseConnected()) {
      const doc = await StaffInvitationModel.create({
        tenantId: new Types.ObjectId(input.tenantId),
        storeId: new Types.ObjectId(input.storeId),
        email: input.email.toLowerCase(),
        roleSlug: input.roleSlug.toLowerCase(),
        tokenHash: input.tokenHash,
        invitedByUserId: new Types.ObjectId(input.invitedByUserId),
        expiresAt: input.expiresAt,
      });
      return {
        id: doc._id.toString(),
        tenantId: doc.tenantId.toString(),
        storeId: doc.storeId.toString(),
        email: doc.email,
        roleSlug: doc.roleSlug,
        tokenHash: doc.tokenHash,
        invitedByUserId: doc.invitedByUserId.toString(),
        status: doc.status,
        expiresAt: doc.expiresAt,
        createdAt: doc.createdAt,
      };
    }

    const rec: StaffInvitationRecord = {
      id: new Types.ObjectId().toString(),
      tenantId: input.tenantId,
      storeId: input.storeId,
      email: input.email.toLowerCase(),
      roleSlug: input.roleSlug.toLowerCase(),
      tokenHash: input.tokenHash,
      invitedByUserId: input.invitedByUserId,
      status: 'PENDING',
      expiresAt: input.expiresAt,
      createdAt: new Date(),
    };
    sandboxInvitations.set(rec.id, rec);
    return { ...rec };
  },

  async listTenantInvitations(tenantId: string): Promise<StaffInvitationRecord[]> {
    await ensureRbacBootstrapped();
    if (isDatabaseConnected()) {
      const docs = await StaffInvitationModel.find({ tenantId: new Types.ObjectId(tenantId) })
        .sort({ createdAt: -1 })
        .lean();
      return docs.map((d) => ({
        id: d._id.toString(),
        tenantId: d.tenantId.toString(),
        storeId: d.storeId.toString(),
        email: d.email,
        roleSlug: d.roleSlug,
        tokenHash: d.tokenHash,
        invitedByUserId: d.invitedByUserId.toString(),
        status: d.status,
        expiresAt: d.expiresAt,
        acceptedAt: d.acceptedAt,
        acceptedByUserId: d.acceptedByUserId?.toString(),
        createdAt: d.createdAt,
      }));
    }

    return Array.from(sandboxInvitations.values())
      .filter((inv) => inv.tenantId === tenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((inv) => ({ ...inv }));
  },

  async findInvitationByTokenHash(tokenHash: string): Promise<StaffInvitationRecord | null> {
    if (isDatabaseConnected()) {
      const d = await StaffInvitationModel.findOne({ tokenHash }).lean();
      if (!d) return null;
      return {
        id: d._id.toString(),
        tenantId: d.tenantId.toString(),
        storeId: d.storeId.toString(),
        email: d.email,
        roleSlug: d.roleSlug,
        tokenHash: d.tokenHash,
        invitedByUserId: d.invitedByUserId.toString(),
        status: d.status,
        expiresAt: d.expiresAt,
        acceptedAt: d.acceptedAt,
        acceptedByUserId: d.acceptedByUserId?.toString(),
        createdAt: d.createdAt,
      };
    }

    for (const inv of sandboxInvitations.values()) {
      if (inv.tokenHash === tokenHash) return { ...inv };
    }
    return null;
  },

  async markInvitationAccepted(invitationId: string, acceptedByUserId: string): Promise<void> {
    const now = new Date();
    if (isDatabaseConnected()) {
      await StaffInvitationModel.updateOne(
        { _id: new Types.ObjectId(invitationId) },
        { $set: { status: 'ACCEPTED', acceptedAt: now, acceptedByUserId: new Types.ObjectId(acceptedByUserId) } }
      );
      return;
    }
    const inv = sandboxInvitations.get(invitationId);
    if (inv) {
      inv.status = 'ACCEPTED';
      inv.acceptedAt = now;
      inv.acceptedByUserId = acceptedByUserId;
    }
  },

  // ---------- PLATFORM USERS DIRECTORY ----------
  async listPlatformUsers(): Promise<Array<{ id: string; email: string; fullName: string; userType: UserType; status: string }>> {
    await ensureRbacBootstrapped();
    if (isDatabaseConnected()) {
      const docs = await UserModel.find({
        userType: {
          $in: ['PLATFORM_SUPER_ADMIN', 'PLATFORM_ADMIN', 'PLATFORM_SUPPORT_AGENT', 'PLATFORM_FINANCE_MANAGER'],
        },
        isDeleted: { $ne: true },
      }).lean();
      return docs.map((d) => ({
        id: d._id.toString(),
        email: d.email,
        fullName: d.fullName,
        userType: d.userType,
        status: d.status,
      }));
    }

    return Array.from(sandboxPlatformUsers.values()).filter((u) =>
      u.userType.startsWith('PLATFORM_')
    );
  },

  async updateUserPlatformRole(userId: string, newUserType: UserType): Promise<boolean> {
    const updated = await authRepository.updateUser(userId, { userType: newUserType });
    if (!updated) return false;
    sandboxPlatformUsers.set(updated.id, {
      id: updated.id,
      email: updated.email,
      fullName: updated.fullName,
      userType: newUserType,
      status: updated.status,
    });
    return true;
  },

  // ---------- TENANT RESOURCES (PRODUCTS & ORDERS FOR AUTHORIZATION / IDOR TESTS) ----------
  async listTenantProducts(tenantId: string): Promise<TenantProductRecord[]> {
    await ensureRbacBootstrapped();
    if (isDatabaseConnected()) {
      const docs = await ProductModel.find({ tenantId: new Types.ObjectId(tenantId), isDeleted: { $ne: true } })
        .setOptions({ bypassTenantCheck: true })
        .lean();
      return docs.map((d: any) => ({
        id: d._id.toString(),
        tenantId: d.tenantId.toString(),
        title: d.title,
        sku: d.slug,
        priceBDT: d.basePriceBDT,
        stockQty: 10,
        status: d.status,
        createdByUserId: d.createdByUserId?.toString() || '',
        updatedAt: d.updatedAt,
      }));
    }
    return Array.from(sandboxProducts.values())
      .filter((p) => p.tenantId === tenantId)
      .map((p) => ({ ...p }));
  },

  async findProductById(productId: string): Promise<TenantProductRecord | null> {
    await ensureRbacBootstrapped();
    if (isDatabaseConnected()) {
      if (!Types.ObjectId.isValid(productId)) return null;
      const d: any = await ProductModel.findById(productId).setOptions({ bypassTenantCheck: true }).lean();
      if (!d) return null;
      return {
        id: d._id.toString(),
        tenantId: d.tenantId.toString(),
        title: d.title,
        sku: d.slug,
        priceBDT: d.basePriceBDT,
        stockQty: 10,
        status: d.status,
        createdByUserId: d.createdByUserId?.toString() || '',
        updatedAt: d.updatedAt,
      };
    }
    const p = sandboxProducts.get(productId);
    return p ? { ...p } : null;
  },

  async createProduct(input: Omit<TenantProductRecord, 'id' | 'updatedAt'>): Promise<TenantProductRecord> {
    const id = `prod_${new Types.ObjectId().toString().slice(-8)}`;
    const rec: TenantProductRecord = { ...input, id, updatedAt: new Date() };
    sandboxProducts.set(id, rec);
    return { ...rec };
  },

  async updateProduct(productId: string, patch: Partial<Pick<TenantProductRecord, 'title' | 'priceBDT' | 'stockQty' | 'status'>>): Promise<TenantProductRecord | null> {
    const existing = sandboxProducts.get(productId);
    if (!existing) return null;
    const updated: TenantProductRecord = { ...existing, ...patch, updatedAt: new Date() };
    sandboxProducts.set(productId, updated);
    return { ...updated };
  },

  async deleteProduct(productId: string): Promise<boolean> {
    return sandboxProducts.delete(productId);
  },

  async listTenantOrders(tenantId: string): Promise<TenantOrderRecord[]> {
    await ensureRbacBootstrapped();
    if (isDatabaseConnected()) {
      const docs: any[] = await OrderModel.find({ tenantId: new Types.ObjectId(tenantId) })
        .setOptions({ bypassTenantCheck: true })
        .lean();
      return docs.map((d) => ({
        id: d._id.toString(),
        tenantId: d.tenantId.toString(),
        orderNumber: d.orderNumber,
        customerUserId: d.customerId?.toString() || '',
        customerEmail: d.customerEmail || '',
        totalBDT: d.grandTotalBDT || 0,
        status: d.status,
        itemsSummary: 'Order items',
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      }));
    }
    return Array.from(sandboxOrders.values())
      .filter((o) => o.tenantId === tenantId)
      .map((o) => ({ ...o }));
  },

  async findOrderById(orderId: string): Promise<TenantOrderRecord | null> {
    await ensureRbacBootstrapped();
    const o = sandboxOrders.get(orderId);
    return o ? { ...o } : null;
  },

  async createOrder(input: Omit<TenantOrderRecord, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt'>): Promise<TenantOrderRecord> {
    const id = `ord_${new Types.ObjectId().toString().slice(-8)}`;
    const rec: TenantOrderRecord = {
      ...input,
      id,
      orderNumber: `NX-${Date.now().toString().slice(-6)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    sandboxOrders.set(id, rec);
    return { ...rec };
  },

  async updateOrderStatus(orderId: string, status: TenantOrderRecord['status']): Promise<TenantOrderRecord | null> {
    const existing = sandboxOrders.get(orderId);
    if (!existing) return null;
    const updated = { ...existing, status, updatedAt: new Date() };
    sandboxOrders.set(orderId, updated);
    return { ...updated };
  },

  // ---------- ADMIN ACTIVITY LOGS ----------
  async recordAdminActivity(entry: Omit<AdminActivityLogRecord, 'id' | 'createdAt'>): Promise<AdminActivityLogRecord> {
    if (isDatabaseConnected()) {
      const doc = await AdminActivityLogModel.create(entry);
      return {
        id: doc._id.toString(),
        scope: doc.scope,
        tenantId: doc.tenantId,
        actorUserId: doc.actorUserId,
        actorEmail: doc.actorEmail,
        actorRole: doc.actorRole,
        action: doc.action as AdminActivityAction,
        resourceType: doc.resourceType,
        resourceId: doc.resourceId,
        outcome: doc.outcome,
        reason: doc.reason,
        ipAddress: doc.ipAddress,
        metadata: doc.metadata,
        createdAt: doc.createdAt,
      };
    }

    const rec: AdminActivityLogRecord = {
      ...entry,
      id: new Types.ObjectId().toString(),
      createdAt: new Date(),
    };
    sandboxActivityLogs.unshift(rec);
    if (sandboxActivityLogs.length > 500) sandboxActivityLogs.pop();
    return { ...rec };
  },

  async listAdminActivityLogs(filter: { tenantId?: string; limit?: number } = {}): Promise<AdminActivityLogRecord[]> {
    await ensureRbacBootstrapped();
    const limit = filter.limit ?? 50;
    if (isDatabaseConnected()) {
      const query: Record<string, any> = {};
      if (filter.tenantId) query.tenantId = filter.tenantId;
      const docs = await AdminActivityLogModel.find(query).sort({ createdAt: -1 }).limit(limit).lean();
      return docs.map((doc) => ({
        id: doc._id.toString(),
        scope: doc.scope,
        tenantId: doc.tenantId,
        actorUserId: doc.actorUserId,
        actorEmail: doc.actorEmail,
        actorRole: doc.actorRole,
        action: doc.action as AdminActivityAction,
        resourceType: doc.resourceType,
        resourceId: doc.resourceId,
        outcome: doc.outcome,
        reason: doc.reason,
        ipAddress: doc.ipAddress,
        metadata: doc.metadata,
        createdAt: doc.createdAt,
      }));
    }

    return sandboxActivityLogs
      .filter((l) => (!filter.tenantId ? true : l.tenantId === filter.tenantId))
      .slice(0, limit)
      .map((l) => ({ ...l }));
  },
};
