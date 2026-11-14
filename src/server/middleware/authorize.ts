/**
 * NEXORA Granular RBAC & Resource-Level Authorization Middleware
 * Server-authoritative permission enforcement, tenant boundary isolation,
 * privilege escalation blocking, and anti-IDOR resource ownership verification.
 */

import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/errors.ts';
import { logSecurityEvent } from '../security/securityLogger.ts';
import {
  extractAccessTokenFromRequest,
  requireAuth,
} from './authenticate.ts';
import { verifyAccessToken } from '../auth/tokens.ts';
import { authRepository } from '../auth/authRepository.ts';
import { rbacRepository } from '../rbac/rbacRepository.ts';
import {
  getRoleDefinition,
  hasAllPermissions,
  hasAnyPermission,
  mapUserTypeToPlatformRoleSlug,
  type RoleScope,
} from '../rbac/permissions.ts';
import { tenantAsyncStorage } from './tenantContext.ts';

export interface TenantAuthorizationContext {
  tenantId: string;
  storeId: string;
  roleSlug: string;
  hierarchyRank: number;
  permissions: string[];
  scope: RoleScope;
}

declare global {
  namespace Express {
    interface Request {
      tenantAuth?: TenantAuthorizationContext;
    }
  }
}

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim().slice(0, 64);
  return (req.ip || req.socket.remoteAddress || '127.0.0.1').slice(0, 64);
}

/**
 * Optional Auth for public storefront endpoints (resolves GUEST if unauthenticated).
 * Still rejects malformed or explicitly invalid tokens!
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractAccessTokenFromRequest(req);
    if (!token) {
      return next(); // GUEST context
    }
    const claims = await verifyAccessToken(token);
    const session = await authRepository.findSessionById(claims.sid);
    if (!session || session.isRevoked || session.expiresAt <= new Date()) {
      throw new UnauthorizedError('Session has been revoked or expired.', 'SESSION_REVOKED');
    }
    const user = await authRepository.findUserById(claims.sub);
    if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== claims.tv) {
      throw new UnauthorizedError('Account session is no longer valid.', 'SESSION_INVALIDATED');
    }
    req.auth = {
      userId: user.id,
      sessionId: session.sessionId,
      email: user.email,
      fullName: user.fullName,
      userType: user.userType,
      isMfaEnabled: user.isMfaEnabled,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Enforces Platform-Level Permissions.
 * Strictly blocks any Tenant (MERCHANT) or Storefront (CUSTOMER/GUEST) actor.
 */
export function requirePlatformPermission(...requiredPermissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    requireAuth(req, res, async (authErr) => {
      if (authErr) return next(authErr);
      try {
        const actor = req.auth!;
        const platformRoleSlug = mapUserTypeToPlatformRoleSlug(actor.userType);

        if (!platformRoleSlug) {
          await rbacRepository.recordAdminActivity({
            scope: 'PLATFORM',
            actorUserId: actor.userId,
            actorEmail: actor.email,
            actorRole: actor.userType.toLowerCase(),
            action: 'PRIVILEGE_ESCALATION_BLOCKED',
            resourceType: 'PlatformEndpoint',
            resourceId: req.originalUrl,
            outcome: 'DENIED',
            reason: `Non-platform role (${actor.userType}) attempted platform-level access.`,
            ipAddress: getClientIp(req),
          });
          logSecurityEvent({
            eventType: 'FORBIDDEN_ACCESS',
            severity: 'HIGH',
            message: `Tenant/Customer user (${actor.email}) blocked from platform endpoint ${req.originalUrl}.`,
          });
          return next(
            new ForbiddenError(
              'Platform administrative role is required for this resource.',
              'PLATFORM_ACCESS_REQUIRED'
            )
          );
        }

        const roleDef = getRoleDefinition(platformRoleSlug);
        const granted = roleDef?.permissionCodes || [];
        if (!hasAllPermissions(granted, requiredPermissions)) {
          await rbacRepository.recordAdminActivity({
            scope: 'PLATFORM',
            actorUserId: actor.userId,
            actorEmail: actor.email,
            actorRole: platformRoleSlug,
            action: 'PERMISSION_DENIED',
            resourceType: 'PlatformEndpoint',
            resourceId: req.originalUrl,
            outcome: 'DENIED',
            reason: `Missing required platform permissions: ${requiredPermissions.join(', ')}`,
            ipAddress: getClientIp(req),
          });
          return next(
            new ForbiddenError(
              `Missing required platform permission: ${requiredPermissions.join(', ')}`,
              'INSUFFICIENT_PLATFORM_PERMISSION'
            )
          );
        }

        next();
      } catch (err) {
        next(err);
      }
    });
  };
}

/**
 * Enforces Store-Scoped Tenant Permissions on /tenants/:tenantId/* routes.
 * Guarantees a Tenant Admin / Owner of Tenant A can NEVER access Tenant B resources.
 * Optionally allows explicit Customer storefront fallback if `allowCustomerWithOwnership` is true.
 */
export function requireTenantPermission(
  requiredPermissions: string[],
  options: {
    allowAnyOf?: boolean;
    allowCustomerPermissions?: string[];
  } = {}
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    requireAuth(req, res, async (authErr) => {
      if (authErr) return next(authErr);
      try {
        const actor = req.auth!;
        const tenantId = String(req.params.tenantId || '').trim();
        if (!tenantId) {
          return next(new NotFoundError('Tenant identifier is missing.', 'TENANT_NOT_FOUND'));
        }

        const tenant = await rbacRepository.findTenantById(tenantId);
        if (!tenant) {
          return next(new NotFoundError('Target tenant store does not exist.', 'TENANT_NOT_FOUND'));
        }
        if (tenant.status === 'SUSPENDED') {
          return next(
            new ForbiddenError(
              'This store is currently suspended by platform governance.',
              'STORE_SUSPENDED'
            )
          );
        }

        // Propagate verified tenantId into AsyncLocalStorage for Mongoose isolation hooks
        const currentStore = tenantAsyncStorage.getStore();
        if (currentStore) {
          currentStore.tenantId = tenant.id;
        }

        // 1. Check active server-stored StoreMembership for THIS exact tenantId
        const membership = await rbacRepository.findMembership(tenant.id, actor.userId);
        if (membership && membership.status === 'ACTIVE') {
          const tenantRole = await rbacRepository.findTenantRole(tenant.id, membership.roleSlug);
          const roleDef = tenantRole || getRoleDefinition(membership.roleSlug);
          const granted = roleDef?.permissionCodes || [];
          const rank = roleDef?.hierarchyRank ?? 30;

          const allowed = options.allowAnyOf
            ? hasAnyPermission(granted, requiredPermissions)
            : hasAllPermissions(granted, requiredPermissions);

          if (!allowed) {
            await rbacRepository.recordAdminActivity({
              scope: 'TENANT',
              tenantId: tenant.id,
              actorUserId: actor.userId,
              actorEmail: actor.email,
              actorRole: membership.roleSlug,
              action: 'PERMISSION_DENIED',
              resourceType: req.baseUrl + req.path,
              outcome: 'DENIED',
              reason: `Role ${membership.roleSlug} lacks permission(s): ${requiredPermissions.join(', ')}`,
              ipAddress: getClientIp(req),
            });
            return next(
              new ForbiddenError(
                `Your store role (${membership.roleSlug}) does not allow this action.`,
                'INSUFFICIENT_TENANT_PERMISSION'
              )
            );
          }

          req.tenantAuth = {
            tenantId: tenant.id,
            storeId: tenant.storeId,
            roleSlug: membership.roleSlug,
            hierarchyRank: rank,
            permissions: granted,
            scope: 'TENANT',
          };
          return next();
        }

        // 2. Storefront Customer Path (for customer-owned resources like own orders)
        if (options.allowCustomerPermissions && actor.userType === 'CUSTOMER') {
          const customerRole = getRoleDefinition('customer')!;
          if (hasAnyPermission(customerRole.permissionCodes, options.allowCustomerPermissions)) {
            req.tenantAuth = {
              tenantId: tenant.id,
              storeId: tenant.storeId,
              roleSlug: 'customer',
              hierarchyRank: customerRole.hierarchyRank,
              permissions: customerRole.permissionCodes,
              scope: 'STOREFRONT',
            };
            return next();
          }
        }

        // 3. Otherwise STRICTLY DENY Cross-Tenant or Non-Member Access
        await rbacRepository.recordAdminActivity({
          scope: 'TENANT',
          tenantId: tenant.id,
          actorUserId: actor.userId,
          actorEmail: actor.email,
          actorRole: actor.userType.toLowerCase(),
          action: 'CROSS_TENANT_ACCESS_BLOCKED',
          resourceType: 'TenantScope',
          resourceId: tenant.id,
          outcome: 'DENIED',
          reason: `Actor has no active membership in tenant ${tenant.slug} (${tenant.id}).`,
          ipAddress: getClientIp(req),
        });
        logSecurityEvent({
          eventType: 'FORBIDDEN_ACCESS',
          severity: 'HIGH',
          message: `Cross-tenant access denied: user ${actor.email} attempted access to tenant ${tenant.id}.`,
        });

        return next(
          new ForbiddenError(
            'Cross-tenant access denied: you do not hold an active membership in this store.',
            'CROSS_TENANT_ACCESS_DENIED'
          )
        );
      } catch (err) {
        next(err);
      }
    });
  };
}
