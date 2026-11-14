/**
 * NEXORA RBAC & Resource-Level Authorization Service
 * Role Assignment, Staff Invitations, Custom Role Permissions,
 * Anti-Escalation, Anti-IDOR Ownership Enforcement & Activity Auditing.
 */

import { env } from '../../../packages/config/src/index.ts';
import { AppError, BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors.ts';
import { logSecurityEvent } from '../security/securityLogger.ts';
import { authRepository } from '../auth/authRepository.ts';
import { generateOpaqueToken, hashOpaqueToken } from '../auth/tokens.ts';
import {
  ALL_TENANT_PERMISSION_CODES,
  PERMISSIONS_CATALOG,
  ROLE_DEFINITIONS,
  getRoleDefinition,
  isPlatformPermission,
  isPlatformRoleSlug,
  mapPlatformRoleSlugToUserType,
  mapUserTypeToPlatformRoleSlug,
} from './permissions.ts';
import {
  rbacRepository,
  ensureRbacBootstrapped,
  type TenantOrderRecord,
  type TenantProductRecord,
} from './rbacRepository.ts';
import type { AuthenticatedContext } from '../middleware/authenticate.ts';
import type { TenantAuthorizationContext } from '../middleware/authorize.ts';

const STAFF_INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const rbacService = {
  async getPublicRbacOverview() {
    await ensureRbacBootstrapped();
    const tenants = await rbacRepository.listTenants();
    return {
      permissions: PERMISSIONS_CATALOG,
      systemRoles: ROLE_DEFINITIONS,
      tenants,
    };
  },

  async getMyPermissionsSummary(actor?: AuthenticatedContext) {
    await ensureRbacBootstrapped();
    if (!actor) {
      const guest = getRoleDefinition('guest')!;
      return {
        authenticated: false,
        scope: 'STOREFRONT',
        roleSlug: 'guest',
        roleName: guest.name,
        permissions: guest.permissionCodes,
        tenants: await rbacRepository.listTenants(),
        memberships: [],
      };
    }

    const tenants = await rbacRepository.listTenants();
    const memberships: Array<{
      tenantId: string;
      tenantName: string;
      tenantSlug: string;
      roleSlug: string;
      permissions: string[];
    }> = [];

    for (const t of tenants) {
      const m = await rbacRepository.findMembership(t.id, actor.userId);
      if (m && m.status === 'ACTIVE') {
        const role = await rbacRepository.findTenantRole(t.id, m.roleSlug);
        memberships.push({
          tenantId: t.id,
          tenantName: t.name,
          tenantSlug: t.slug,
          roleSlug: m.roleSlug,
          permissions: role?.permissionCodes || getRoleDefinition(m.roleSlug)?.permissionCodes || [],
        });
      }
    }

    const platformRoleSlug = mapUserTypeToPlatformRoleSlug(actor.userType);
    const platformRole = platformRoleSlug ? getRoleDefinition(platformRoleSlug) : null;
    const customerRole = actor.userType === 'CUSTOMER' ? getRoleDefinition('customer') : null;

    return {
      authenticated: true,
      user: actor,
      platformRole: platformRole
        ? { slug: platformRole.slug, name: platformRole.name, permissions: platformRole.permissionCodes }
        : null,
      storefrontRole: customerRole
        ? { slug: customerRole.slug, name: customerRole.name, permissions: customerRole.permissionCodes }
        : null,
      memberships,
      tenants,
    };
  },

  // ==========================================
  // PLATFORM ROLE GOVERNANCE
  // ==========================================
  async listPlatformUsersAndRoles() {
    await ensureRbacBootstrapped();
    const users = await rbacRepository.listPlatformUsers();
    return users.map((u) => {
      const slug = mapUserTypeToPlatformRoleSlug(u.userType) || 'unknown';
      const def = getRoleDefinition(slug);
      return {
        ...u,
        platformRoleSlug: slug,
        platformRoleName: def?.name || u.userType,
        permissions: def?.permissionCodes || [],
      };
    });
  },

  async assignPlatformRole(params: {
    actor: AuthenticatedContext;
    targetEmail: string;
    roleSlug: string;
    ipAddress: string;
  }) {
    const actorPlatformSlug = mapUserTypeToPlatformRoleSlug(params.actor.userType);
    const actorRoleDef = actorPlatformSlug ? getRoleDefinition(actorPlatformSlug) : null;
    if (!actorRoleDef) {
      throw new ForbiddenError('Platform role required.', 'PLATFORM_ACCESS_REQUIRED');
    }

    const targetSlug = params.roleSlug.trim().toLowerCase();
    const targetRoleDef = getRoleDefinition(targetSlug);
    const targetUserType = mapPlatformRoleSlugToUserType(targetSlug);

    if (!targetRoleDef || !targetUserType || targetRoleDef.scope !== 'PLATFORM') {
      throw new BadRequestError('Invalid platform role specified.');
    }

    // Privilege Escalation Guard: Actor cannot assign a role >= their own rank (unless super_admin)
    if (actorRoleDef.slug !== 'super_admin' && targetRoleDef.hierarchyRank >= actorRoleDef.hierarchyRank) {
      await rbacRepository.recordAdminActivity({
        scope: 'PLATFORM',
        actorUserId: params.actor.userId,
        actorEmail: params.actor.email,
        actorRole: actorRoleDef.slug,
        action: 'PRIVILEGE_ESCALATION_BLOCKED',
        resourceType: 'PlatformRole',
        resourceId: targetSlug,
        outcome: 'DENIED',
        reason: `${actorRoleDef.slug} attempted to assign higher/equal platform role ${targetSlug}.`,
        ipAddress: params.ipAddress,
      });
      throw new ForbiddenError(
        `Privilege escalation blocked: ${actorRoleDef.name} cannot assign ${targetRoleDef.name}.`,
        'PRIVILEGE_ESCALATION_BLOCKED'
      );
    }

    const targetUser = await authRepository.findUserByEmail(params.targetEmail);
    if (!targetUser) {
      throw new NotFoundError('Target user account not found.');
    }

    const existingTargetPlatformSlug = mapUserTypeToPlatformRoleSlug(targetUser.userType);
    if (existingTargetPlatformSlug === 'super_admin' && actorRoleDef.slug !== 'super_admin') {
      throw new ForbiddenError(
        'Only Super Admin may modify another Super Admin account.',
        'PRIVILEGE_ESCALATION_BLOCKED'
      );
    }

    await rbacRepository.updateUserPlatformRole(targetUser.id, targetUserType);

    await rbacRepository.recordAdminActivity({
      scope: 'PLATFORM',
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: actorRoleDef.slug,
      action: 'PLATFORM_ROLE_ASSIGNED',
      resourceType: 'User',
      resourceId: targetUser.id,
      outcome: 'ALLOWED',
      reason: `Assigned platform role ${targetRoleDef.slug} to ${targetUser.email}.`,
      ipAddress: params.ipAddress,
    });

    return {
      userId: targetUser.id,
      email: targetUser.email,
      platformRoleSlug: targetRoleDef.slug,
      userType: targetUserType,
    };
  },

  async revokePlatformRole(params: {
    actor: AuthenticatedContext;
    targetUserId: string;
    ipAddress: string;
  }) {
    const actorPlatformSlug = mapUserTypeToPlatformRoleSlug(params.actor.userType);
    const actorRoleDef = actorPlatformSlug ? getRoleDefinition(actorPlatformSlug) : null;
    if (!actorRoleDef) {
      throw new ForbiddenError('Platform role required.', 'PLATFORM_ACCESS_REQUIRED');
    }

    if (params.targetUserId === params.actor.userId) {
      throw new BadRequestError('You cannot revoke your own platform administrative role.');
    }

    const targetUser = await authRepository.findUserById(params.targetUserId);
    if (!targetUser) {
      throw new NotFoundError('Target user not found.');
    }

    const targetSlug = mapUserTypeToPlatformRoleSlug(targetUser.userType);
    const targetDef = targetSlug ? getRoleDefinition(targetSlug) : null;
    if (!targetDef) {
      throw new BadRequestError('Target user does not hold a platform role.');
    }

    if (actorRoleDef.slug !== 'super_admin' && targetDef.hierarchyRank >= actorRoleDef.hierarchyRank) {
      await rbacRepository.recordAdminActivity({
        scope: 'PLATFORM',
        actorUserId: params.actor.userId,
        actorEmail: params.actor.email,
        actorRole: actorRoleDef.slug,
        action: 'PRIVILEGE_ESCALATION_BLOCKED',
        resourceType: 'PlatformRole',
        resourceId: targetUser.id,
        outcome: 'DENIED',
        reason: `Blocked revocation of equal/higher platform role (${targetSlug}).`,
        ipAddress: params.ipAddress,
      });
      throw new ForbiddenError('Cannot revoke a role equal or superior to your own.', 'PRIVILEGE_ESCALATION_BLOCKED');
    }

    await rbacRepository.updateUserPlatformRole(targetUser.id, 'CUSTOMER');
    await rbacRepository.recordAdminActivity({
      scope: 'PLATFORM',
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: actorRoleDef.slug,
      action: 'PLATFORM_ROLE_REVOKED',
      resourceType: 'User',
      resourceId: targetUser.id,
      outcome: 'ALLOWED',
      reason: `Revoked platform role ${targetDef.slug} from ${targetUser.email}.`,
      ipAddress: params.ipAddress,
    });

    return { revoked: true, userId: targetUser.id, email: targetUser.email };
  },

  // ==========================================
  // TENANT ROLES, PERMISSIONS, MEMBERSHIPS & INVITATIONS
  // ==========================================
  async listTenantRoles(tenantId: string) {
    return rbacRepository.listTenantRoles(tenantId);
  },

  async updateTenantRolePermissions(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    roleSlug: string;
    permissionCodes: string[];
    ipAddress: string;
  }) {
    const slug = params.roleSlug.trim().toLowerCase();

    // Never allow platform permissions inside a tenant role
    const invalidPlatformPerms = params.permissionCodes.filter((c) => isPlatformPermission(c));
    if (invalidPlatformPerms.length > 0) {
      await rbacRepository.recordAdminActivity({
        scope: 'TENANT',
        tenantId: params.tenantAuth.tenantId,
        actorUserId: params.actor.userId,
        actorEmail: params.actor.email,
        actorRole: params.tenantAuth.roleSlug,
        action: 'PRIVILEGE_ESCALATION_BLOCKED',
        resourceType: 'TenantRole',
        resourceId: slug,
        outcome: 'DENIED',
        reason: `Blocked injection of platform permissions (${invalidPlatformPerms.join(', ')}) into tenant role.`,
        ipAddress: params.ipAddress,
      });
      throw new ForbiddenError(
        'Tenant roles can never hold platform-level permissions.',
        'PRIVILEGE_ESCALATION_BLOCKED'
      );
    }

    const allowedTenantSet = new Set(ALL_TENANT_PERMISSION_CODES);
    const unknown = params.permissionCodes.filter((c) => !allowedTenantSet.has(c));
    if (unknown.length > 0) {
      throw new BadRequestError(`Unknown or non-tenant permission code(s): ${unknown.join(', ')}`);
    }

    const existing = await rbacRepository.findTenantRole(params.tenantAuth.tenantId, slug);
    if (!existing) {
      throw new NotFoundError('Tenant role not found.');
    }

    if (existing.slug === 'store_owner') {
      throw new ForbiddenError('The Store Owner role permissions are immutable.', 'IMMUTABLE_OWNER_ROLE');
    }

    if (
      params.tenantAuth.roleSlug !== 'store_owner' &&
      existing.hierarchyRank >= params.tenantAuth.hierarchyRank
    ) {
      throw new ForbiddenError(
        'Cannot modify a role with equal or higher hierarchy rank than your own.',
        'PRIVILEGE_ESCALATION_BLOCKED'
      );
    }

    const updated = await rbacRepository.upsertTenantRole({
      tenantId: params.tenantAuth.tenantId,
      name: existing.name,
      slug: existing.slug,
      description: existing.description,
      permissionCodes: Array.from(new Set(params.permissionCodes)),
      hierarchyRank: existing.hierarchyRank,
      isSystemDefault: existing.isSystemDefault,
    });

    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'TENANT_ROLE_UPDATED',
      resourceType: 'TenantRole',
      resourceId: slug,
      outcome: 'ALLOWED',
      reason: `Updated permissions for ${slug} (${updated.permissionCodes.length} permissions).`,
      ipAddress: params.ipAddress,
    });

    return updated;
  },

  async createCustomTenantRole(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    name: string;
    slug: string;
    description?: string;
    permissionCodes: string[];
    ipAddress: string;
  }) {
    const slug = params.slug.trim().toLowerCase();
    if (isPlatformRoleSlug(slug) || slug === 'store_owner') {
      throw new ForbiddenError('Reserved role slug is prohibited.', 'PRIVILEGE_ESCALATION_BLOCKED');
    }

    const platformPerms = params.permissionCodes.filter((c) => isPlatformPermission(c));
    if (platformPerms.length > 0) {
      await rbacRepository.recordAdminActivity({
        scope: 'TENANT',
        tenantId: params.tenantAuth.tenantId,
        actorUserId: params.actor.userId,
        actorEmail: params.actor.email,
        actorRole: params.tenantAuth.roleSlug,
        action: 'PRIVILEGE_ESCALATION_BLOCKED',
        resourceType: 'TenantRole',
        resourceId: slug,
        outcome: 'DENIED',
        reason: `Blocked platform permission assignment (${platformPerms.join(', ')}) on custom tenant role.`,
        ipAddress: params.ipAddress,
      });
      throw new ForbiddenError('Tenant roles cannot contain platform permissions.', 'PRIVILEGE_ESCALATION_BLOCKED');
    }

    const allowedTenantSet = new Set(ALL_TENANT_PERMISSION_CODES);
    const unknown = params.permissionCodes.filter((c) => !allowedTenantSet.has(c));
    if (unknown.length > 0) {
      throw new BadRequestError(`Invalid tenant permission code(s): ${unknown.join(', ')}`);
    }

    const created = await rbacRepository.upsertTenantRole({
      tenantId: params.tenantAuth.tenantId,
      name: params.name.trim(),
      slug,
      description: params.description?.trim() || 'Custom tenant role',
      permissionCodes: Array.from(new Set(params.permissionCodes)),
      hierarchyRank: Math.min(45, params.tenantAuth.hierarchyRank - 5),
      isSystemDefault: false,
    });

    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'TENANT_ROLE_UPDATED',
      resourceType: 'TenantRole',
      resourceId: slug,
      outcome: 'ALLOWED',
      reason: `Created custom tenant role ${slug}.`,
      ipAddress: params.ipAddress,
    });

    return created;
  },

  async listTenantMembershipsAndInvites(tenantId: string) {
    const [memberships, invitations] = await Promise.all([
      rbacRepository.listTenantMemberships(tenantId),
      rbacRepository.listTenantInvitations(tenantId),
    ]);
    return { memberships, invitations };
  },

  async assignTenantMemberRole(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    targetUserId: string;
    roleSlug: string;
    ipAddress: string;
  }) {
    const targetSlug = params.roleSlug.trim().toLowerCase();

    // Block assigning any Platform role through a tenant endpoint
    if (isPlatformRoleSlug(targetSlug)) {
      await rbacRepository.recordAdminActivity({
        scope: 'TENANT',
        tenantId: params.tenantAuth.tenantId,
        actorUserId: params.actor.userId,
        actorEmail: params.actor.email,
        actorRole: params.tenantAuth.roleSlug,
        action: 'PRIVILEGE_ESCALATION_BLOCKED',
        resourceType: 'StoreMembership',
        resourceId: params.targetUserId,
        outcome: 'DENIED',
        reason: `Blocked attempt to assign platform role '${targetSlug}' via tenant endpoint.`,
        ipAddress: params.ipAddress,
      });
      throw new ForbiddenError(
        'A tenant role or endpoint can never assign a platform-level role.',
        'PRIVILEGE_ESCALATION_BLOCKED'
      );
    }

    const targetRole = await rbacRepository.findTenantRole(params.tenantAuth.tenantId, targetSlug);
    if (!targetRole) {
      throw new BadRequestError('Target tenant role does not exist.');
    }

    // Hierarchy Enforcement: cannot assign role >= caller's rank unless caller is store_owner
    if (
      params.tenantAuth.roleSlug !== 'store_owner' &&
      targetRole.hierarchyRank >= params.tenantAuth.hierarchyRank
    ) {
      await rbacRepository.recordAdminActivity({
        scope: 'TENANT',
        tenantId: params.tenantAuth.tenantId,
        actorUserId: params.actor.userId,
        actorEmail: params.actor.email,
        actorRole: params.tenantAuth.roleSlug,
        action: 'PRIVILEGE_ESCALATION_BLOCKED',
        resourceType: 'StoreMembership',
        resourceId: params.targetUserId,
        outcome: 'DENIED',
        reason: `Blocked escalation: ${params.tenantAuth.roleSlug} attempted to assign ${targetSlug}.`,
        ipAddress: params.ipAddress,
      });
      throw new ForbiddenError(
        `Privilege escalation blocked: ${params.tenantAuth.roleSlug} cannot assign ${targetSlug}.`,
        'PRIVILEGE_ESCALATION_BLOCKED'
      );
    }

    const existingMembership = await rbacRepository.findMembership(
      params.tenantAuth.tenantId,
      params.targetUserId
    );
    if (existingMembership?.roleSlug === 'store_owner' && params.tenantAuth.roleSlug !== 'store_owner') {
      throw new ForbiddenError('Cannot modify the Store Owner membership.', 'PRIVILEGE_ESCALATION_BLOCKED');
    }

    const targetUser = await authRepository.findUserById(params.targetUserId);
    if (!targetUser) {
      throw new NotFoundError('Target user not found.');
    }

    const updated = await rbacRepository.upsertMembership({
      tenantId: params.tenantAuth.tenantId,
      storeId: params.tenantAuth.storeId,
      userId: targetUser.id,
      userEmail: targetUser.email,
      userFullName: targetUser.fullName,
      roleId: targetRole.id,
      roleSlug: targetRole.slug,
      invitedBy: params.actor.userId,
    });

    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'TENANT_ROLE_ASSIGNED',
      resourceType: 'StoreMembership',
      resourceId: targetUser.id,
      outcome: 'ALLOWED',
      reason: `Assigned store role ${targetRole.slug} to ${targetUser.email}.`,
      ipAddress: params.ipAddress,
    });

    return updated;
  },

  async revokeTenantMember(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    targetUserId: string;
    ipAddress: string;
  }) {
    const existing = await rbacRepository.findMembership(params.tenantAuth.tenantId, params.targetUserId);
    if (!existing || existing.status !== 'ACTIVE') {
      throw new NotFoundError('Active store membership not found.');
    }

    if (existing.roleSlug === 'store_owner') {
      throw new ForbiddenError('Store Owner membership cannot be revoked.', 'PRIVILEGE_ESCALATION_BLOCKED');
    }

    const targetRole = await rbacRepository.findTenantRole(params.tenantAuth.tenantId, existing.roleSlug);
    if (
      params.tenantAuth.roleSlug !== 'store_owner' &&
      (targetRole?.hierarchyRank ?? 0) >= params.tenantAuth.hierarchyRank
    ) {
      throw new ForbiddenError('Cannot revoke a member with equal or higher rank.', 'PRIVILEGE_ESCALATION_BLOCKED');
    }

    await rbacRepository.revokeMembership(params.tenantAuth.tenantId, params.targetUserId, params.actor.userId);

    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'MEMBERSHIP_REVOKED',
      resourceType: 'StoreMembership',
      resourceId: params.targetUserId,
      outcome: 'ALLOWED',
      reason: `Revoked ${existing.roleSlug} membership for ${existing.userEmail}.`,
      ipAddress: params.ipAddress,
    });

    return { revoked: true, userId: params.targetUserId };
  },

  async inviteStaff(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    email: string;
    roleSlug: string;
    ipAddress: string;
  }) {
    const targetSlug = params.roleSlug.trim().toLowerCase();
    if (isPlatformRoleSlug(targetSlug)) {
      await rbacRepository.recordAdminActivity({
        scope: 'TENANT',
        tenantId: params.tenantAuth.tenantId,
        actorUserId: params.actor.userId,
        actorEmail: params.actor.email,
        actorRole: params.tenantAuth.roleSlug,
        action: 'PRIVILEGE_ESCALATION_BLOCKED',
        resourceType: 'StaffInvitation',
        resourceId: params.email,
        outcome: 'DENIED',
        reason: `Blocked staff invitation for platform role '${targetSlug}'.`,
        ipAddress: params.ipAddress,
      });
      throw new ForbiddenError('Cannot invite staff to a platform-level role.', 'PRIVILEGE_ESCALATION_BLOCKED');
    }

    const role = await rbacRepository.findTenantRole(params.tenantAuth.tenantId, targetSlug);
    if (!role) {
      throw new BadRequestError('Specified tenant role does not exist.');
    }

    if (
      params.tenantAuth.roleSlug !== 'store_owner' &&
      role.hierarchyRank >= params.tenantAuth.hierarchyRank
    ) {
      throw new ForbiddenError(
        `Cannot invite staff to a role (${role.name}) equal or higher than your own.`,
        'PRIVILEGE_ESCALATION_BLOCKED'
      );
    }

    const { rawToken, tokenHash } = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + STAFF_INVITE_TTL_MS);

    const invitation = await rbacRepository.createInvitation({
      tenantId: params.tenantAuth.tenantId,
      storeId: params.tenantAuth.storeId,
      email: params.email.trim().toLowerCase(),
      roleSlug: role.slug,
      tokenHash,
      invitedByUserId: params.actor.userId,
      expiresAt,
    });

    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'STAFF_INVITED',
      resourceType: 'StaffInvitation',
      resourceId: invitation.id,
      outcome: 'ALLOWED',
      reason: `Invited ${invitation.email} as ${invitation.roleSlug}.`,
      ipAddress: params.ipAddress,
    });

    return {
      invitation: {
        id: invitation.id,
        tenantId: invitation.tenantId,
        email: invitation.email,
        roleSlug: invitation.roleSlug,
        status: invitation.status,
        expiresAt: invitation.expiresAt.toISOString(),
      },
      ...(env.NODE_ENV !== 'production' ? { inviteTokenPreview: rawToken } : {}),
    };
  },

  async acceptStaffInvitation(params: {
    actor: AuthenticatedContext;
    token: string;
    ipAddress: string;
  }) {
    const tokenHash = hashOpaqueToken(params.token.trim());
    const invitation = await rbacRepository.findInvitationByTokenHash(tokenHash);

    if (!invitation || invitation.status !== 'PENDING' || invitation.expiresAt <= new Date()) {
      throw new AppError('Staff invitation token is invalid, already used, or expired.', 400, 'INVALID_INVITE_TOKEN');
    }

    // Strict ownership check on invitee email
    if (invitation.email !== params.actor.email.toLowerCase()) {
      await rbacRepository.recordAdminActivity({
        scope: 'TENANT',
        tenantId: invitation.tenantId,
        actorUserId: params.actor.userId,
        actorEmail: params.actor.email,
        actorRole: params.actor.userType.toLowerCase(),
        action: 'IDOR_OWNERSHIP_DENIED',
        resourceType: 'StaffInvitation',
        resourceId: invitation.id,
        outcome: 'DENIED',
        reason: `User ${params.actor.email} attempted to accept invite issued for ${invitation.email}.`,
        ipAddress: params.ipAddress,
      });
      throw new ForbiddenError('This invitation was issued for a different email address.', 'INVITE_EMAIL_MISMATCH');
    }

    const role = await rbacRepository.findTenantRole(invitation.tenantId, invitation.roleSlug);
    if (!role) {
      throw new NotFoundError('Assigned role no longer exists.');
    }

    await rbacRepository.markInvitationAccepted(invitation.id, params.actor.userId);
    const membership = await rbacRepository.upsertMembership({
      tenantId: invitation.tenantId,
      storeId: invitation.storeId,
      userId: params.actor.userId,
      userEmail: params.actor.email,
      userFullName: params.actor.fullName,
      roleId: role.id,
      roleSlug: role.slug,
      invitedBy: invitation.invitedByUserId,
    });

    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: invitation.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: role.slug,
      action: 'STAFF_INVITE_ACCEPTED',
      resourceType: 'StoreMembership',
      resourceId: membership.id,
      outcome: 'ALLOWED',
      reason: `${params.actor.email} joined tenant as ${role.slug}.`,
      ipAddress: params.ipAddress,
    });

    return { accepted: true, membership };
  },

  // ==========================================
  // STORE-SCOPED & OWNERSHIP-PROTECTED RESOURCES
  // ==========================================
  async listPublicStorefrontProducts(tenantId: string) {
    const tenant = await rbacRepository.findTenantById(tenantId);
    if (!tenant) throw new NotFoundError('Store not found.');
    const products = await rbacRepository.listTenantProducts(tenant.id);
    return products.filter((p) => p.status === 'PUBLISHED');
  },

  async listTenantProducts(tenantId: string) {
    return rbacRepository.listTenantProducts(tenantId);
  },

  async createTenantProduct(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    title: string;
    sku: string;
    priceBDT: number;
    stockQty: number;
    status?: TenantProductRecord['status'];
    ipAddress: string;
  }) {
    const created = await rbacRepository.createProduct({
      tenantId: params.tenantAuth.tenantId,
      title: params.title.trim(),
      sku: params.sku.trim().toUpperCase(),
      priceBDT: params.priceBDT,
      stockQty: params.stockQty,
      status: params.status || 'DRAFT',
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
      reason: `Created product ${created.sku}.`,
      ipAddress: params.ipAddress,
    });

    return created;
  },

  async updateTenantProduct(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    productId: string;
    patch: Partial<Pick<TenantProductRecord, 'title' | 'priceBDT' | 'status'>>;
    ipAddress: string;
  }) {
    const product = await rbacRepository.findProductById(params.productId);
    if (!product || product.tenantId !== params.tenantAuth.tenantId) {
      // Cross-tenant IDOR protection: never leak or mutate another tenant's productId!
      if (product && product.tenantId !== params.tenantAuth.tenantId) {
        await rbacRepository.recordAdminActivity({
          scope: 'TENANT',
          tenantId: params.tenantAuth.tenantId,
          actorUserId: params.actor.userId,
          actorEmail: params.actor.email,
          actorRole: params.tenantAuth.roleSlug,
          action: 'CROSS_TENANT_ACCESS_BLOCKED',
          resourceType: 'Product',
          resourceId: params.productId,
          outcome: 'DENIED',
          reason: `Blocked cross-tenant product mutation (${params.productId} belongs to ${product.tenantId}).`,
          ipAddress: params.ipAddress,
        });
        throw new ForbiddenError('Product belongs to a different tenant.', 'CROSS_TENANT_ACCESS_DENIED');
      }
      throw new NotFoundError('Product not found in this store.');
    }

    const canUpdateAny = params.tenantAuth.permissions.includes('product:update');
    const canUpdateOwn = params.tenantAuth.permissions.includes('product:update:own');

    if (!canUpdateAny && !(canUpdateOwn && product.createdByUserId === params.actor.userId)) {
      await rbacRepository.recordAdminActivity({
        scope: 'TENANT',
        tenantId: params.tenantAuth.tenantId,
        actorUserId: params.actor.userId,
        actorEmail: params.actor.email,
        actorRole: params.tenantAuth.roleSlug,
        action: 'IDOR_OWNERSHIP_DENIED',
        resourceType: 'Product',
        resourceId: product.id,
        outcome: 'DENIED',
        reason: `Role ${params.tenantAuth.roleSlug} may only update self-created products.`,
        ipAddress: params.ipAddress,
      });
      throw new ForbiddenError(
        'Resource ownership denied: you can only modify products you created.',
        'RESOURCE_OWNERSHIP_DENIED'
      );
    }

    const updated = await rbacRepository.updateProduct(product.id, params.patch);
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'RESOURCE_UPDATED',
      resourceType: 'Product',
      resourceId: product.id,
      outcome: 'ALLOWED',
      reason: `Updated product ${product.sku}.`,
      ipAddress: params.ipAddress,
    });
    return updated!;
  },

  async adjustProductInventory(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    productId: string;
    stockQty: number;
    ipAddress: string;
  }) {
    const product = await rbacRepository.findProductById(params.productId);
    if (!product || product.tenantId !== params.tenantAuth.tenantId) {
      throw new ForbiddenError('Product does not belong to this tenant store.', 'CROSS_TENANT_ACCESS_DENIED');
    }
    const updated = await rbacRepository.updateProduct(product.id, { stockQty: params.stockQty });
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'RESOURCE_UPDATED',
      resourceType: 'Inventory',
      resourceId: product.id,
      outcome: 'ALLOWED',
      reason: `Updated stockQty for ${product.sku} to ${params.stockQty}.`,
      ipAddress: params.ipAddress,
    });
    return updated!;
  },

  async deleteTenantProduct(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    productId: string;
    ipAddress: string;
  }) {
    const product = await rbacRepository.findProductById(params.productId);
    if (!product) throw new NotFoundError('Product not found.');
    if (product.tenantId !== params.tenantAuth.tenantId) {
      throw new ForbiddenError('Cross-tenant product deletion denied.', 'CROSS_TENANT_ACCESS_DENIED');
    }
    await rbacRepository.deleteProduct(product.id);
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'RESOURCE_DELETED',
      resourceType: 'Product',
      resourceId: product.id,
      outcome: 'ALLOWED',
      reason: `Deleted product ${product.sku}.`,
      ipAddress: params.ipAddress,
    });
    return { deleted: true, productId: product.id };
  },

  // ---------- ORDERS (STRICT ANTI-IDOR OWNERSHIP CHECKS) ----------
  async listOrdersForActor(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
  }) {
    const allTenantOrders = await rbacRepository.listTenantOrders(params.tenantAuth.tenantId);
    if (params.tenantAuth.scope === 'TENANT' && params.tenantAuth.permissions.includes('order:read')) {
      return allTenantOrders;
    }
    // Customer storefront scope: ONLY return orders owned by this customer!
    return allTenantOrders.filter((o) => o.customerUserId === params.actor.userId);
  },

  async getOrderWithOwnershipCheck(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    orderId: string;
    ipAddress: string;
  }) {
    const order = await rbacRepository.findOrderById(params.orderId);
    if (!order) throw new NotFoundError('Order not found.');

    // Strict Tenant Isolation check first
    if (order.tenantId !== params.tenantAuth.tenantId) {
      await rbacRepository.recordAdminActivity({
        scope: 'TENANT',
        tenantId: params.tenantAuth.tenantId,
        actorUserId: params.actor.userId,
        actorEmail: params.actor.email,
        actorRole: params.tenantAuth.roleSlug,
        action: 'CROSS_TENANT_ACCESS_BLOCKED',
        resourceType: 'Order',
        resourceId: params.orderId,
        outcome: 'DENIED',
        reason: `Blocked cross-tenant IDOR read on order ${params.orderId}.`,
        ipAddress: params.ipAddress,
      });
      throw new ForbiddenError('Order belongs to another tenant store.', 'CROSS_TENANT_ACCESS_DENIED');
    }

    // Tenant staff with order:read may inspect store orders
    if (params.tenantAuth.scope === 'TENANT' && params.tenantAuth.permissions.includes('order:read')) {
      return order;
    }

    // Otherwise strict customer ownership check (Anti-IDOR)
    if (order.customerUserId !== params.actor.userId) {
      await rbacRepository.recordAdminActivity({
        scope: 'STOREFRONT',
        tenantId: params.tenantAuth.tenantId,
        actorUserId: params.actor.userId,
        actorEmail: params.actor.email,
        actorRole: params.tenantAuth.roleSlug,
        action: 'IDOR_OWNERSHIP_DENIED',
        resourceType: 'Order',
        resourceId: order.id,
        outcome: 'DENIED',
        reason: `IDOR blocked: ${params.actor.email} attempted to read order belonging to ${order.customerEmail}.`,
        ipAddress: params.ipAddress,
      });
      logSecurityEvent({
        eventType: 'FORBIDDEN_ACCESS',
        severity: 'HIGH',
        message: `IDOR attempt blocked on Order ${order.id} by user ${params.actor.email}.`,
      });
      throw new ForbiddenError('You may only view your own orders.', 'RESOURCE_OWNERSHIP_DENIED');
    }

    return order;
  },

  async createCustomerOrder(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    itemsSummary: string;
    totalBDT: number;
    ipAddress: string;
  }) {
    const order = await rbacRepository.createOrder({
      tenantId: params.tenantAuth.tenantId,
      customerUserId: params.actor.userId,
      customerEmail: params.actor.email,
      totalBDT: params.totalBDT,
      status: 'PENDING',
      itemsSummary: params.itemsSummary.trim(),
    });
    await rbacRepository.recordAdminActivity({
      scope: 'STOREFRONT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'RESOURCE_CREATED',
      resourceType: 'Order',
      resourceId: order.id,
      outcome: 'ALLOWED',
      reason: `Order ${order.orderNumber} placed by ${params.actor.email}.`,
      ipAddress: params.ipAddress,
    });
    return order;
  },

  async cancelOwnOrder(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    orderId: string;
    ipAddress: string;
  }) {
    const order = await rbacRepository.findOrderById(params.orderId);
    if (!order || order.tenantId !== params.tenantAuth.tenantId) {
      throw new ForbiddenError('Order not accessible in this tenant.', 'CROSS_TENANT_ACCESS_DENIED');
    }

    if (order.customerUserId !== params.actor.userId) {
      await rbacRepository.recordAdminActivity({
        scope: 'STOREFRONT',
        tenantId: params.tenantAuth.tenantId,
        actorUserId: params.actor.userId,
        actorEmail: params.actor.email,
        actorRole: params.tenantAuth.roleSlug,
        action: 'IDOR_OWNERSHIP_DENIED',
        resourceType: 'Order',
        resourceId: order.id,
        outcome: 'DENIED',
        reason: `IDOR blocked: ${params.actor.email} attempted to cancel order owned by ${order.customerEmail}.`,
        ipAddress: params.ipAddress,
      });
      throw new ForbiddenError('You may only cancel your own orders.', 'RESOURCE_OWNERSHIP_DENIED');
    }

    if (order.status !== 'PENDING') {
      throw new BadRequestError(`Only PENDING orders can be self-cancelled (current: ${order.status}).`);
    }

    const updated = await rbacRepository.updateOrderStatus(order.id, 'CANCELLED');
    await rbacRepository.recordAdminActivity({
      scope: 'STOREFRONT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'RESOURCE_UPDATED',
      resourceType: 'Order',
      resourceId: order.id,
      outcome: 'ALLOWED',
      reason: `Customer cancelled own order ${order.orderNumber}.`,
      ipAddress: params.ipAddress,
    });
    return updated!;
  },

  async updateTenantOrderStatus(params: {
    actor: AuthenticatedContext;
    tenantAuth: TenantAuthorizationContext;
    orderId: string;
    status: TenantOrderRecord['status'];
    ipAddress: string;
  }) {
    const order = await rbacRepository.findOrderById(params.orderId);
    if (!order || order.tenantId !== params.tenantAuth.tenantId) {
      throw new ForbiddenError('Order belongs to a different tenant store.', 'CROSS_TENANT_ACCESS_DENIED');
    }

    if (params.status === 'REFUNDED' && !params.tenantAuth.permissions.includes('order:refund')) {
      throw new ForbiddenError('Issuing refunds requires order:refund permission.', 'INSUFFICIENT_TENANT_PERMISSION');
    }

    const updated = await rbacRepository.updateOrderStatus(order.id, params.status);
    await rbacRepository.recordAdminActivity({
      scope: 'TENANT',
      tenantId: params.tenantAuth.tenantId,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      actorRole: params.tenantAuth.roleSlug,
      action: 'RESOURCE_UPDATED',
      resourceType: 'Order',
      resourceId: order.id,
      outcome: 'ALLOWED',
      reason: `Order ${order.orderNumber} transitioned to ${params.status}.`,
      ipAddress: params.ipAddress,
    });
    return updated!;
  },

  async listActivityLogs(filter: { tenantId?: string; limit?: number }) {
    return rbacRepository.listAdminActivityLogs(filter);
  },
};
