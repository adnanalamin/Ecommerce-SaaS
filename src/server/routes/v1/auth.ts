/**
 * NEXORA Authentication & Identity Routes (/api/v1/auth)
 * Implements cookie-based HttpOnly/SameSite/Signed session auth, refresh rotation,
 * CSRF double-submit pairing, MFA/TOTP, backup codes, lockout, and device management.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService, type ClientMetadata, type SessionIssueResult } from '../../auth/authService.ts';
import { authRateLimiter } from '../../middleware/rateLimiter.ts';
import { validateRequest } from '../../middleware/validateRequest.ts';
import {
  requireAuth,
  SESSION_COOKIE_BASE,
  REFRESH_COOKIE_BASE,
  getCookieName,
} from '../../middleware/authenticate.ts';
import { issueCsrfCookie } from '../../middleware/csrf.ts';
import { setSecureAuthCookie, clearSecureAuthCookie } from '../../security/cookies.ts';
import { sendSuccess, sendError } from '../../utils/apiResponse.ts';
import { UnauthorizedError } from '../../utils/errors.ts';

export const authRouter = Router();

// ==========================================
// STRICT ZOD REQUEST SCHEMAS
// ==========================================
const RegisterSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(180),
    password: z.string().min(10).max(128),
    phone: z.string().trim().min(6).max(24).optional(),
    accountType: z.enum(['CUSTOMER', 'MERCHANT']).optional(),
  })
  .strict();

const VerifyEmailSchema = z
  .object({
    token: z.string().trim().min(16).max(256),
  })
  .strict();

const EmailOnlySchema = z
  .object({
    email: z.string().trim().email().max(180),
  })
  .strict();

const LoginSchema = z
  .object({
    email: z.string().trim().email().max(180),
    password: z.string().min(1).max(128),
  })
  .strict();

const VerifyMfaLoginSchema = z
  .object({
    mfaTicket: z.string().trim().min(10).max(1024),
    code: z.string().trim().min(6).max(16),
  })
  .strict();

const ResetPasswordSchema = z
  .object({
    token: z.string().trim().min(16).max(256),
    newPassword: z.string().min(10).max(128),
  })
  .strict();

const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(10).max(128),
  })
  .strict();

const TotpCodeSchema = z
  .object({
    code: z.string().trim().regex(/^\d{6}$/, 'Provide a 6-digit authenticator code.'),
  })
  .strict();

const DisableMfaSchema = z
  .object({
    password: z.string().min(1).max(128),
    code: z.string().trim().regex(/^\d{6}$/, 'Provide a 6-digit authenticator code.'),
  })
  .strict();

const PasswordOnlySchema = z
  .object({
    password: z.string().min(1).max(128),
  })
  .strict();

const SessionParamSchema = z
  .object({
    sessionId: z.string().trim().min(8).max(100),
  })
  .strict();

// ==========================================
// COOKIE & METADATA HELPERS
// ==========================================
function extractClientMeta(req: Request): ClientMetadata {
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp =
    typeof forwarded === 'string' && forwarded.length > 0
      ? forwarded.split(',')[0].trim()
      : req.ip || req.socket.remoteAddress || '127.0.0.1';

  return {
    ipAddress: rawIp.slice(0, 64),
    userAgent: String(req.headers['user-agent'] || 'Unknown Client').slice(0, 500),
  };
}

function attachSessionCookies(res: Response, issued: SessionIssueResult) {
  setSecureAuthCookie(
    res,
    SESSION_COOKIE_BASE,
    issued.accessToken,
    authService.ACCESS_TOKEN_TTL_SECONDS * 1000
  );
  setSecureAuthCookie(
    res,
    REFRESH_COOKIE_BASE,
    issued.refreshToken,
    authService.REFRESH_TOKEN_TTL_MS
  );
  const csrfToken = issueCsrfCookie(res);

  // Access & refresh tokens remain strictly in HttpOnly cookies (never exposed for localStorage)
  return {
    user: issued.user,
    sessionId: issued.sessionId,
    expiresAt: issued.expiresAt,
    suspiciousSignals: issued.suspiciousSignals,
    csrfToken,
  };
}

function clearAllAuthCookies(res: Response): void {
  clearSecureAuthCookie(res, SESSION_COOKIE_BASE);
  clearSecureAuthCookie(res, REFRESH_COOKIE_BASE);
}

function extractRefreshToken(req: Request): string | null {
  const cookieName = getCookieName(REFRESH_COOKIE_BASE);
  const signedVal = req.signedCookies?.[cookieName];
  if (typeof signedVal === 'string' && signedVal.length > 0) {
    return signedVal;
  }
  const unsignedVal = req.cookies?.[cookieName];
  if (typeof unsignedVal === 'string' && unsignedVal.length > 0 && !unsignedVal.startsWith('s:')) {
    return unsignedVal;
  }
  return null;
}

// ==========================================
// PUBLIC & PRE-AUTH ENDPOINTS
// ==========================================

/**
 * GET /api/v1/auth/csrf
 * Issues signed double-submit CSRF cookie for SPA mutations
 */
authRouter.get('/csrf', (_req: Request, res: Response) => {
  const csrfToken = issueCsrfCookie(res);
  return sendSuccess(res, { csrfToken });
});

/**
 * POST /api/v1/auth/register
 */
authRouter.post(
  '/register',
  authRateLimiter,
  validateRequest({ body: RegisterSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.register(req.body);
      return sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/auth/verify-email
 */
authRouter.post(
  '/verify-email',
  validateRequest({ body: VerifyEmailSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.verifyEmail(req.body.token);
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/auth/resend-verification
 */
authRouter.post(
  '/resend-verification',
  authRateLimiter,
  validateRequest({ body: EmailOnlySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.resendVerification(req.body.email);
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/auth/login
 */
authRouter.post(
  '/login',
  authRateLimiter,
  validateRequest({ body: LoginSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.login(req.body, extractClientMeta(req));
      if (result.mfaRequired) {
        const csrfToken = issueCsrfCookie(res);
        return sendSuccess(res, { ...result, csrfToken });
      }
      return sendSuccess(res, {
        mfaRequired: false,
        ...attachSessionCookies(res, result),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/auth/mfa/verify-login
 */
authRouter.post(
  '/mfa/verify-login',
  authRateLimiter,
  validateRequest({ body: VerifyMfaLoginSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const issued = await authService.completeMfaLogin(req.body, extractClientMeta(req));
      return sendSuccess(res, {
        mfaRequired: false,
        ...attachSessionCookies(res, issued),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/auth/refresh
 * Cookie-authenticated + CSRF protected refresh token rotation
 */
authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = extractRefreshToken(req);
    if (!refreshToken) {
      throw new UnauthorizedError('Refresh credential cookie is missing.', 'REFRESH_TOKEN_MISSING');
    }
    const issued = await authService.refreshSession(refreshToken, extractClientMeta(req));
    return sendSuccess(res, attachSessionCookies(res, issued));
  } catch (err) {
    clearAllAuthCookies(res);
    next(err);
  }
});

/**
 * POST /api/v1/auth/forgot-password
 */
authRouter.post(
  '/forgot-password',
  authRateLimiter,
  validateRequest({ body: EmailOnlySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.forgotPassword(req.body.email);
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/auth/reset-password
 */
authRouter.post(
  '/reset-password',
  authRateLimiter,
  validateRequest({ body: ResetPasswordSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.resetPassword(req.body);
      clearAllAuthCookies(res);
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// AUTHENTICATED ACCOUNT & SESSION ENDPOINTS
// ==========================================

/**
 * GET /api/v1/auth/me
 */
authRouter.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const csrfToken = issueCsrfCookie(res);
    return sendSuccess(res, {
      user: req.auth,
      sessionId: req.auth!.sessionId,
      csrfToken,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/logout
 */
authRouter.post('/logout', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.logoutSession(req.auth!.sessionId);
    clearAllAuthCookies(res);
    return sendSuccess(res, { loggedOut: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/logout-all
 */
authRouter.post('/logout-all', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.logoutAllSessions(req.auth!.userId);
    clearAllAuthCookies(res);
    return sendSuccess(res, { loggedOutAll: true, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/change-password
 */
authRouter.post(
  '/change-password',
  requireAuth,
  validateRequest({ body: ChangePasswordSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.changePassword({
        userId: req.auth!.userId,
        currentSessionId: req.auth!.sessionId,
        currentPassword: req.body.currentPassword,
        newPassword: req.body.newPassword,
      });
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/auth/sessions
 */
authRouter.get('/sessions', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessions = await authService.listSessions(req.auth!.userId, req.auth!.sessionId);
    return sendSuccess(res, { sessions });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/auth/sessions/:sessionId
 */
authRouter.delete(
  '/sessions/:sessionId',
  requireAuth,
  validateRequest({ params: SessionParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetId = String(req.params.sessionId);
      const result = await authService.revokeSpecificSession(req.auth!.userId, targetId);
      if (targetId === req.auth!.sessionId) {
        clearAllAuthCookies(res);
      }
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/auth/login-history
 */
authRouter.get('/login-history', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const history = await authService.getLoginHistory(req.auth!.userId);
    return sendSuccess(res, { history });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/mfa/setup
 */
authRouter.post('/mfa/setup', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const setup = await authService.setupMfa(req.auth!.userId);
    return sendSuccess(res, setup);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/mfa/confirm
 */
authRouter.post(
  '/mfa/confirm',
  requireAuth,
  validateRequest({ body: TotpCodeSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.confirmMfaSetup(req.auth!.userId, req.body.code);
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/auth/mfa/disable
 */
authRouter.post(
  '/mfa/disable',
  requireAuth,
  validateRequest({ body: DisableMfaSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.disableMfa(req.auth!.userId, req.body.password, req.body.code);
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/auth/mfa/backup-codes/regenerate
 */
authRouter.post(
  '/mfa/backup-codes/regenerate',
  requireAuth,
  validateRequest({ body: PasswordOnlySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.regenerateBackupCodes(req.auth!.userId, req.body.password);
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET / POST /api/v1/auth/verify
 * Runs the automated Phase 06 authentication verification suite
 */
authRouter.all('/verify', async (_req: Request, res: Response) => {
  try {
    const { runAuthVerificationSuite } = await import('../../auth/testAuth.ts');
    const report = await runAuthVerificationSuite();
    return sendSuccess(res, report);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Authentication verification execution failed';
    return sendError(res, 500, 'AUTH_VERIFY_ERROR', msg);
  }
});
