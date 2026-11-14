/**
 * NEXORA Authentication Engine
 * Session & JWT Verification Middleware (HttpOnly Cookie + Bearer Support + Revocation Check)
 */

import { Request, Response, NextFunction } from 'express';
import { env } from '../../../packages/config/src/index.ts';
import { verifyAccessToken } from '../auth/tokens.ts';
import { authRepository } from '../auth/authRepository.ts';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.ts';
import { logSecurityEvent } from '../security/securityLogger.ts';
import type { UserType } from '../db/schemas/global/users.ts';

export interface AuthenticatedContext {
  userId: string;
  sessionId: string;
  email: string;
  fullName: string;
  userType: UserType;
  isMfaEnabled: boolean;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedContext;
    }
  }
}

export const SESSION_COOKIE_BASE = 'nexora_session';
export const REFRESH_COOKIE_BASE = 'nexora_refresh';

export function getCookieName(base: string): string {
  return env.NODE_ENV === 'production' ? `__Host-${base}` : base;
}

export function extractAccessTokenFromRequest(req: Request): string | null {
  // 1. Primary: Signed HttpOnly cookie (browser SPA)
  const cookieName = getCookieName(SESSION_COOKIE_BASE);
  const signedCookieToken = req.signedCookies?.[cookieName];
  if (typeof signedCookieToken === 'string' && signedCookieToken.length > 0) {
    return signedCookieToken;
  }

  // 2. Fallback: Unsigned cookie if parsed directly in test environments
  const rawCookieToken = req.cookies?.[cookieName];
  if (typeof rawCookieToken === 'string' && rawCookieToken.length > 0 && !rawCookieToken.startsWith('s:')) {
    return rawCookieToken;
  }

  // 3. Secondary: Authorization: Bearer <token> (for API clients / automated tests)
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractAccessTokenFromRequest(req);
    if (!token) {
      throw new UnauthorizedError('Authentication required.', 'UNAUTHENTICATED');
    }

    let claims;
    try {
      claims = await verifyAccessToken(token);
    } catch {
      throw new UnauthorizedError('Access token is invalid or expired.', 'INVALID_OR_EXPIRED_TOKEN');
    }

    // Always verify server-managed session revocation & expiry (prevents revoked JWT reuse)
    const session = await authRepository.findSessionById(claims.sid);
    if (!session || session.isRevoked || session.expiresAt <= new Date()) {
      logSecurityEvent({
        eventType: 'AUTH_FAILURE',
        severity: 'MEDIUM',
        message: `Rejected request using revoked or expired session (${claims.sid})`,
      });
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

export function requireRole(...allowedRoles: UserType[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      return next(new UnauthorizedError('Authentication required.', 'UNAUTHENTICATED'));
    }
    if (!allowedRoles.includes(req.auth.userType)) {
      logSecurityEvent({
        eventType: 'FORBIDDEN_ACCESS',
        severity: 'HIGH',
        message: `Role ${req.auth.userType} attempted unauthorized access to restricted resource.`,
      });
      return next(new ForbiddenError('Insufficient permissions for this operation.', 'INSUFFICIENT_ROLE'));
    }
    next();
  };
}
