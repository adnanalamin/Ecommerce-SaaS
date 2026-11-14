/**
 * NEXORA Authentication Service
 * Core Identity, Session, Refresh-Rotation, MFA, Lockout & Suspicious Login Engine
 */

import { createHash, randomUUID } from 'node:crypto';
import { env } from '../../../packages/config/src/index.ts';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  AppError,
} from '../utils/errors.ts';
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from '../security/password.ts';
import {
  encryptSecret,
  decryptSecret,
  constantTimeEquals,
} from '../security/secrets.ts';
import { logSecurityEvent } from '../security/securityLogger.ts';
import { logger } from '../utils/logger.ts';
import { authRepository, type AuthUserRecord } from './authRepository.ts';
import {
  signAccessToken,
  signMfaTicket,
  verifyMfaTicket,
  generateOpaqueToken,
  hashOpaqueToken,
  generateRefreshTokenPair,
  extractSessionIdFromRefreshToken,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_MS,
  EMAIL_VERIFY_TTL_MS,
  PASSWORD_RESET_TTL_MS,
} from './tokens.ts';
import {
  generateTotpSecret,
  buildTotpOtpAuthUri,
  verifyTotpCode,
  generateBackupCodes,
  hashBackupCode,
} from './totp.ts';
import type { SuspiciousSignal } from '../db/schemas/global/auth.ts';

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const ACCOUNT_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export interface ClientMetadata {
  ipAddress: string;
  userAgent: string;
}

export interface PublicUserDto {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  userType: AuthUserRecord['userType'];
  status: AuthUserRecord['status'];
  isMfaEnabled: boolean;
  emailVerifiedAt?: string;
  lastLoginAt?: string;
  lastLoginIp?: string;
  createdAt: string;
}

export interface SessionIssueResult {
  user: PublicUserDto;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresAt: string;
  suspiciousSignals: SuspiciousSignal[];
}

export function toPublicUserDto(user: AuthUserRecord): PublicUserDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    userType: user.userType,
    status: user.status,
    isMfaEnabled: user.isMfaEnabled,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString(),
    lastLoginIp: user.lastLoginIp,
    createdAt: user.createdAt.toISOString(),
  };
}

function hashUserAgent(ua: string): string {
  return createHash('sha256').update(ua || 'unknown').digest('hex').slice(0, 24);
}

export function parseDeviceLabel(userAgent: string): string {
  const ua = (userAgent || '').toLowerCase();
  let browser = 'API / Unknown Client';
  if (ua.includes('edg/')) browser = 'Microsoft Edge';
  else if (ua.includes('chrome/')) browser = 'Google Chrome';
  else if (ua.includes('firefox/')) browser = 'Mozilla Firefox';
  else if (ua.includes('safari/') && !ua.includes('chrome')) browser = 'Apple Safari';
  else if (ua.includes('curl')) browser = 'cURL CLI';
  else if (ua.includes('node') || ua.includes('undici')) browser = 'Node.js Client';

  let os = 'Unknown OS';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac os') || ua.includes('macintosh')) os = 'macOS';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
  else if (ua.includes('linux')) os = 'Linux';

  return `${browser} on ${os}`;
}

function computeSuspiciousSignals(
  user: AuthUserRecord,
  meta: ClientMetadata
): SuspiciousSignal[] {
  const signals: SuspiciousSignal[] = [];
  const currentUaHash = hashUserAgent(meta.userAgent);

  if (user.lastLoginAt) {
    if (user.lastLoginIp && user.lastLoginIp !== meta.ipAddress) {
      signals.push('NEW_IP_ADDRESS');
    }
    if (user.lastKnownUserAgentHash && user.lastKnownUserAgentHash !== currentUaHash) {
      signals.push('NEW_DEVICE_USER_AGENT');
    }
  }
  if (user.failedLoginAttempts >= 3) {
    signals.push('RECENT_FAILED_ATTEMPTS');
  }
  return signals;
}

async function createSessionAndTokens(
  user: AuthUserRecord,
  meta: ClientMetadata,
  suspiciousSignals: SuspiciousSignal[]
): Promise<SessionIssueResult> {
  const sessionId = `ses_${randomUUID()}`;
  const familyId = `fam_${randomUUID()}`;
  const deviceLabel = parseDeviceLabel(meta.userAgent);
  const uaHash = hashUserAgent(meta.userAgent);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  const { refreshToken, refreshTokenHash } = generateRefreshTokenPair(sessionId);

  await authRepository.createSession({
    sessionId,
    userId: user.id,
    familyId,
    tokenVersion: user.tokenVersion,
    currentRefreshTokenHash: refreshTokenHash,
    deviceLabel,
    userAgent: (meta.userAgent || 'unknown').slice(0, 500),
    userAgentHash: uaHash,
    ipAddress: meta.ipAddress,
    expiresAt,
  });

  const accessToken = await signAccessToken({
    userId: user.id,
    sessionId,
    role: user.userType,
    tokenVersion: user.tokenVersion,
  });

  await authRepository.updateUser(user.id, {
    failedLoginAttempts: 0,
    unsetLockedUntil: true,
    lastLoginAt: new Date(),
    lastLoginIp: meta.ipAddress,
    lastKnownUserAgentHash: uaHash,
  });

  await authRepository.recordLoginHistory({
    userId: user.id,
    email: user.email,
    sessionId,
    status: suspiciousSignals.length > 0 ? 'SUSPICIOUS_FLAGGED' : 'SUCCESS',
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    deviceLabel,
    suspiciousSignals,
  });

  if (suspiciousSignals.length > 0) {
    logSecurityEvent({
      eventType: 'AUTH_FAILURE',
      severity: 'MEDIUM',
      message: `Suspicious login signals detected for ${user.email}: ${suspiciousSignals.join(', ')}`,
      metadata: { signals: suspiciousSignals, ipAddress: meta.ipAddress },
    });
  }

  return {
    user: toPublicUserDto(user),
    accessToken,
    refreshToken,
    sessionId,
    expiresAt: expiresAt.toISOString(),
    suspiciousSignals,
  };
}

export const authService = {
  // 1. REGISTRATION (Never trusts client-supplied ADMIN roles)
  async register(input: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
    accountType?: 'MERCHANT' | 'CUSTOMER';
  }) {
    const strength = validatePasswordStrength(input.password);
    if (!strength.valid) {
      throw new BadRequestError(`Weak password: ${strength.reasons.join(' ')}`);
    }

    const existing = await authRepository.findUserByEmail(input.email);
    if (existing) {
      throw new ConflictError('An account with this email address already exists.', 'EMAIL_ALREADY_EXISTS');
    }

    const passwordHash = await hashPassword(input.password);
    // Strict authorization invariant: public registration may ONLY create CUSTOMER or MERCHANT
    const safeRole = input.accountType === 'MERCHANT' ? 'MERCHANT' : 'CUSTOMER';

    const user = await authRepository.createUser({
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      passwordHash,
      phone: input.phone,
      userType: safeRole,
      status: 'PENDING_VERIFICATION',
    });

    const { rawToken, tokenHash } = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFY_TTL_MS);
    await authRepository.createAuthToken({
      userId: user.id,
      type: 'EMAIL_VERIFY',
      tokenHash,
      expiresAt,
    });

    logger.info('[AUTH] Registered new account pending email verification', { userId: user.id, role: safeRole });

    return {
      user: toPublicUserDto(user),
      requiresEmailVerification: true,
      expiresAt: expiresAt.toISOString(),
      // Sandbox preview token ONLY exposed in non-production for testing/UI verification
      ...(env.NODE_ENV !== 'production' ? { verificationTokenPreview: rawToken } : {}),
    };
  },

  // 2. EMAIL VERIFICATION
  async verifyEmail(rawToken: string) {
    const tokenHash = hashOpaqueToken(rawToken);
    const tokenRecord = await authRepository.findTokenByHash(tokenHash, 'EMAIL_VERIFY');

    if (!tokenRecord || tokenRecord.consumedAt || tokenRecord.expiresAt <= new Date()) {
      throw new AppError('Email verification token is invalid or has expired.', 400, 'INVALID_VERIFICATION_TOKEN');
    }

    const user = await authRepository.findUserById(tokenRecord.userId);
    if (!user) {
      throw new NotFoundError('Associated user account not found.');
    }

    await authRepository.consumeAuthToken(tokenHash);
    const updated = await authRepository.updateUser(user.id, {
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    });

    return {
      verified: true,
      user: toPublicUserDto(updated || user),
    };
  },

  async resendVerification(email: string) {
    const user = await authRepository.findUserByEmail(email);
    if (!user || user.status !== 'PENDING_VERIFICATION') {
      return { sent: true }; // Prevent enumeration
    }

    await authRepository.invalidateTokensForUser(user.id, 'EMAIL_VERIFY');
    const { rawToken, tokenHash } = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFY_TTL_MS);

    await authRepository.createAuthToken({
      userId: user.id,
      type: 'EMAIL_VERIFY',
      tokenHash,
      expiresAt,
    });

    return {
      sent: true,
      ...(env.NODE_ENV !== 'production' ? { verificationTokenPreview: rawToken } : {}),
    };
  },

  // 3. LOGIN (With Lockout, Argon2id, Suspicious Detection & Optional MFA Challenge)
  async login(
    input: { email: string; password: string },
    meta: ClientMetadata
  ): Promise<
    | { mfaRequired: true; mfaTicket: string; methods: ['TOTP', 'BACKUP_CODE'] }
    | ({ mfaRequired: false } & SessionIssueResult)
  > {
    const email = input.email.trim().toLowerCase();
    const deviceLabel = parseDeviceLabel(meta.userAgent);
    const user = await authRepository.findUserByEmail(email);

    if (!user) {
      // Mitigate timing discrepancy by still running a dummy Argon2 verify shape or fast fail with log
      await authRepository.recordLoginHistory({
        email,
        status: 'FAILED',
        failureReason: 'ACCOUNT_NOT_FOUND',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        deviceLabel,
        suspiciousSignals: [],
      });
      throw new UnauthorizedError('Invalid email or password.', 'INVALID_CREDENTIALS');
    }

    // Check active account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const retryAfterSeconds = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      await authRepository.recordLoginHistory({
        userId: user.id,
        email: user.email,
        status: 'LOCKED',
        failureReason: 'ACCOUNT_LOCKED',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        deviceLabel,
        suspiciousSignals: ['RECENT_FAILED_ATTEMPTS'],
      });
      logSecurityEvent({
        eventType: 'AUTH_FAILURE',
        severity: 'HIGH',
        message: `Blocked login attempt on locked account (${user.email})`,
        metadata: { retryAfterSeconds },
      });
      throw new AppError(
        `Account temporarily locked due to too many failed attempts. Try again in ${retryAfterSeconds} seconds.`,
        423,
        'ACCOUNT_LOCKED'
      );
    }

    // Verify Argon2id password hash
    const passwordMatches = await verifyPassword(user.passwordHash, input.password);
    if (!passwordMatches) {
      const nextFailures = (user.failedLoginAttempts || 0) + 1;
      const shouldLock = nextFailures >= MAX_FAILED_LOGIN_ATTEMPTS;
      const lockedUntil = shouldLock ? new Date(Date.now() + ACCOUNT_LOCKOUT_DURATION_MS) : undefined;

      await authRepository.updateUser(user.id, {
        failedLoginAttempts: nextFailures,
        ...(lockedUntil ? { lockedUntil } : {}),
      });

      await authRepository.recordLoginHistory({
        userId: user.id,
        email: user.email,
        status: shouldLock ? 'LOCKED' : 'FAILED',
        failureReason: shouldLock ? 'LOCKOUT_TRIGGERED' : 'INVALID_PASSWORD',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        deviceLabel,
        suspiciousSignals: nextFailures >= 3 ? ['RECENT_FAILED_ATTEMPTS'] : [],
      });

      logSecurityEvent({
        eventType: 'AUTH_FAILURE',
        severity: shouldLock ? 'HIGH' : 'MEDIUM',
        message: shouldLock
          ? `Account locked after ${nextFailures} consecutive failed login attempts.`
          : `Failed login attempt (${nextFailures}/${MAX_FAILED_LOGIN_ATTEMPTS}).`,
      });

      if (shouldLock) {
        throw new AppError(
          'Account locked for 15 minutes due to multiple consecutive failed login attempts.',
          423,
          'ACCOUNT_LOCKED'
        );
      }

      throw new UnauthorizedError('Invalid email or password.', 'INVALID_CREDENTIALS');
    }

    if (user.status === 'SUSPENDED') {
      throw new ForbiddenError('This account has been suspended.', 'ACCOUNT_SUSPENDED');
    }

    if (user.status === 'PENDING_VERIFICATION') {
      throw new ForbiddenError('Please verify your email address before signing in.', 'EMAIL_NOT_VERIFIED');
    }

    // Optional MFA/TOTP Challenge
    if (user.isMfaEnabled && user.mfaSecretEncrypted) {
      const mfaTicket = await signMfaTicket(user.id);
      await authRepository.recordLoginHistory({
        userId: user.id,
        email: user.email,
        status: 'MFA_CHALLENGE',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        deviceLabel,
        suspiciousSignals: computeSuspiciousSignals(user, meta),
      });
      return {
        mfaRequired: true,
        mfaTicket,
        methods: ['TOTP', 'BACKUP_CODE'],
      };
    }

    const suspiciousSignals = computeSuspiciousSignals(user, meta);
    const issued = await createSessionAndTokens(user, meta, suspiciousSignals);
    return { mfaRequired: false, ...issued };
  },

  // 4. COMPLETE MFA LOGIN (TOTP or Single-Use Backup Code)
  async completeMfaLogin(
    input: { mfaTicket: string; code: string },
    meta: ClientMetadata
  ): Promise<SessionIssueResult> {
    let ticketPayload;
    try {
      ticketPayload = await verifyMfaTicket(input.mfaTicket);
    } catch {
      throw new UnauthorizedError('MFA challenge ticket is invalid or expired.', 'INVALID_MFA_TICKET');
    }

    const user = await authRepository.findUserById(ticketPayload.sub);
    if (!user || !user.isMfaEnabled || !user.mfaSecretEncrypted) {
      throw new UnauthorizedError('MFA is not configured for this account.', 'MFA_NOT_ENABLED');
    }

    const trimmedCode = input.code.trim();
    let mfaValid = false;

    if (/^\d{6}$/.test(trimmedCode)) {
      const secretBase32 = decryptSecret(user.mfaSecretEncrypted, user.id);
      mfaValid = verifyTotpCode(secretBase32, trimmedCode, 1);
    } else {
      // Check hashed single-use backup codes
      const candidateHash = hashBackupCode(trimmedCode);
      const matchIndex = user.mfaBackupCodesHashed.findIndex((stored) =>
        constantTimeEquals(stored, candidateHash)
      );
      if (matchIndex !== -1) {
        mfaValid = true;
        const remainingCodes = [...user.mfaBackupCodesHashed];
        remainingCodes.splice(matchIndex, 1); // Consume single-use backup code
        await authRepository.updateUser(user.id, { mfaBackupCodesHashed: remainingCodes });
      }
    }

    if (!mfaValid) {
      logSecurityEvent({
        eventType: 'AUTH_FAILURE',
        severity: 'HIGH',
        message: `Invalid MFA TOTP/backup code submitted for user ${user.id}`,
      });
      throw new UnauthorizedError('Invalid verification or backup code.', 'INVALID_MFA_CODE');
    }

    const suspiciousSignals = computeSuspiciousSignals(user, meta);
    return createSessionAndTokens(user, meta, suspiciousSignals);
  },

  // 5. REFRESH TOKEN ROTATION & REPLAY DETECTION
  async refreshSession(
    presentedRefreshToken: string,
    meta: ClientMetadata
  ): Promise<SessionIssueResult> {
    const sessionId = extractSessionIdFromRefreshToken(presentedRefreshToken);
    if (!sessionId) {
      throw new UnauthorizedError('Malformed refresh token.', 'INVALID_REFRESH_TOKEN');
    }

    const session = await authRepository.findSessionById(sessionId);
    if (!session) {
      throw new UnauthorizedError('Session not found.', 'SESSION_NOT_FOUND');
    }

    if (session.isRevoked) {
      logSecurityEvent({
        eventType: 'AUTH_FAILURE',
        severity: 'HIGH',
        message: `Attempted refresh on already revoked session ${sessionId}`,
      });
      throw new UnauthorizedError('Session has been revoked. Please sign in again.', 'SESSION_REVOKED');
    }

    if (session.expiresAt <= new Date()) {
      await authRepository.revokeSession(sessionId, 'SESSION_EXPIRED');
      throw new UnauthorizedError('Session expired. Please sign in again.', 'SESSION_EXPIRED');
    }

    const presentedHash = hashOpaqueToken(presentedRefreshToken);

    // REPLAY ATTACK DETECTION:
    // If token does not match currentRefreshTokenHash, revoke the ENTIRE session family immediately!
    if (!constantTimeEquals(presentedHash, session.currentRefreshTokenHash)) {
      await authRepository.revokeSession(sessionId, 'REFRESH_TOKEN_REUSE_DETECTED');
      logSecurityEvent({
        eventType: 'AUTH_FAILURE',
        severity: 'CRITICAL',
        message: `Refresh token replay detected on session ${sessionId}. Session revoked immediately.`,
        metadata: { userId: session.userId, familyId: session.familyId },
      });
      throw new UnauthorizedError(
        'Security alert: Refresh token reuse detected. Session has been terminated.',
        'REFRESH_TOKEN_REUSED'
      );
    }

    const user = await authRepository.findUserById(session.userId);
    if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== session.tokenVersion) {
      await authRepository.revokeSession(sessionId, 'USER_TOKEN_VERSION_MISMATCH');
      throw new UnauthorizedError('Session invalidated due to account security update.', 'SESSION_INVALIDATED');
    }

    // Rotate refresh token atomically
    const { refreshToken: nextRefreshToken, refreshTokenHash: nextRefreshHash } =
      generateRefreshTokenPair(session.sessionId);
    const nextExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await authRepository.rotateSessionRefreshToken({
      sessionId: session.sessionId,
      previousRefreshTokenHash: session.currentRefreshTokenHash,
      newRefreshTokenHash: nextRefreshHash,
      newExpiresAt: nextExpiresAt,
      ipAddress: meta.ipAddress,
    });

    const nextAccessToken = await signAccessToken({
      userId: user.id,
      sessionId: session.sessionId,
      role: user.userType,
      tokenVersion: user.tokenVersion,
    });

    return {
      user: toPublicUserDto(user),
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      sessionId: session.sessionId,
      expiresAt: nextExpiresAt.toISOString(),
      suspiciousSignals: [],
    };
  },

  // 6. LOGOUT & SESSION REVOCATION
  async logoutSession(sessionId: string): Promise<void> {
    await authRepository.revokeSession(sessionId, 'USER_LOGOUT');
  },

  async logoutAllSessions(userId: string): Promise<{ revokedCount: number }> {
    const user = await authRepository.findUserById(userId);
    if (!user) throw new NotFoundError('User not found.');
    const revokedCount = await authRepository.revokeAllUserSessions(userId, 'USER_LOGOUT_ALL');
    await authRepository.updateUser(userId, { tokenVersion: (user.tokenVersion || 1) + 1 });
    return { revokedCount };
  },

  // 7. FORGOT PASSWORD & PASSWORD RESET
  async forgotPassword(email: string) {
    const user = await authRepository.findUserByEmail(email);
    if (!user) {
      // Uniform generic response prevents user enumeration
      return { requested: true };
    }

    await authRepository.invalidateTokensForUser(user.id, 'PASSWORD_RESET');
    const { rawToken, tokenHash } = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    await authRepository.createAuthToken({
      userId: user.id,
      type: 'PASSWORD_RESET',
      tokenHash,
      expiresAt,
    });

    logger.info('[AUTH] Password reset token issued', { userId: user.id });

    return {
      requested: true,
      expiresAt: expiresAt.toISOString(),
      ...(env.NODE_ENV !== 'production' ? { resetTokenPreview: rawToken } : {}),
    };
  },

  async resetPassword(input: { token: string; newPassword: string; expiresOverrideTest?: boolean }) {
    const strength = validatePasswordStrength(input.newPassword);
    if (!strength.valid) {
      throw new BadRequestError(`Weak password: ${strength.reasons.join(' ')}`);
    }

    const tokenHash = hashOpaqueToken(input.token);
    const tokenRecord = await authRepository.findTokenByHash(tokenHash, 'PASSWORD_RESET');

    if (!tokenRecord || tokenRecord.consumedAt || tokenRecord.expiresAt <= new Date()) {
      throw new AppError('Password reset token is invalid or has expired.', 400, 'INVALID_RESET_TOKEN');
    }

    const user = await authRepository.findUserById(tokenRecord.userId);
    if (!user) {
      throw new NotFoundError('User account not found.');
    }

    const newHash = await hashPassword(input.newPassword);
    await authRepository.consumeAuthToken(tokenHash);

    // Bump tokenVersion + clear lockout + revoke ALL existing sessions for security
    await authRepository.updateUser(user.id, {
      passwordHash: newHash,
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      unsetLockedUntil: true,
      tokenVersion: (user.tokenVersion || 1) + 1,
    });
    await authRepository.revokeAllUserSessions(user.id, 'PASSWORD_RESET');

    return { reset: true };
  },

  // 8. SECURE PASSWORD CHANGE (Authenticated)
  async changePassword(input: {
    userId: string;
    currentSessionId: string;
    currentPassword: string;
    newPassword: string;
  }) {
    const user = await authRepository.findUserById(input.userId);
    if (!user) throw new NotFoundError('User not found.');

    const currentValid = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!currentValid) {
      logSecurityEvent({
        eventType: 'AUTH_FAILURE',
        severity: 'MEDIUM',
        message: `Incorrect current password provided during password change by user ${user.id}`,
      });
      throw new UnauthorizedError('Current password is incorrect.', 'INVALID_CURRENT_PASSWORD');
    }

    if (input.currentPassword === input.newPassword) {
      throw new BadRequestError('New password must differ from current password.');
    }

    const strength = validatePasswordStrength(input.newPassword);
    if (!strength.valid) {
      throw new BadRequestError(`Weak password: ${strength.reasons.join(' ')}`);
    }

    const newHash = await hashPassword(input.newPassword);
    await authRepository.updateUser(user.id, {
      passwordHash: newHash,
      passwordChangedAt: new Date(),
    });

    // Revoke all OTHER device sessions cleanly
    const revokedOtherSessions = await authRepository.revokeAllUserSessions(
      user.id,
      'PASSWORD_CHANGED',
      input.currentSessionId
    );

    return { changed: true, revokedOtherSessions };
  },

  // 9. OPTIONAL MFA/TOTP & BACKUP CODES MANAGEMENT
  async setupMfa(userId: string) {
    const user = await authRepository.findUserById(userId);
    if (!user) throw new NotFoundError('User not found.');
    if (user.isMfaEnabled) {
      throw new ConflictError('MFA is already enabled on this account.');
    }

    const secret = generateTotpSecret();
    const encrypted = encryptSecret(secret, user.id);
    await authRepository.updateUser(user.id, { mfaSecretEncrypted: encrypted });

    return {
      secret,
      otpauthUri: buildTotpOtpAuthUri({ secret, email: user.email, issuer: 'NEXORA' }),
    };
  },

  async confirmMfaSetup(userId: string, totpCode: string) {
    const user = await authRepository.findUserById(userId);
    if (!user || !user.mfaSecretEncrypted) {
      throw new BadRequestError('Initiate MFA setup first before confirming.');
    }

    const secret = decryptSecret(user.mfaSecretEncrypted, user.id);
    if (!verifyTotpCode(secret, totpCode, 1)) {
      throw new UnauthorizedError('Invalid 6-digit TOTP authenticator code.', 'INVALID_TOTP_CODE');
    }

    const { plaintextCodes, hashedCodes } = generateBackupCodes(8);
    await authRepository.updateUser(user.id, {
      isMfaEnabled: true,
      mfaBackupCodesHashed: hashedCodes,
    });

    return {
      mfaEnabled: true,
      backupCodes: plaintextCodes, // Returned ONCE
    };
  },

  async disableMfa(userId: string, password: string, code: string) {
    const user = await authRepository.findUserById(userId);
    if (!user || !user.isMfaEnabled || !user.mfaSecretEncrypted) {
      throw new BadRequestError('MFA is not currently enabled.');
    }

    const passOk = await verifyPassword(user.passwordHash, password);
    if (!passOk) {
      throw new UnauthorizedError('Invalid password.', 'INVALID_CREDENTIALS');
    }

    const secret = decryptSecret(user.mfaSecretEncrypted, user.id);
    if (!verifyTotpCode(secret, code, 1)) {
      throw new UnauthorizedError('Invalid 6-digit TOTP code.', 'INVALID_TOTP_CODE');
    }

    await authRepository.updateUser(user.id, {
      isMfaEnabled: false,
      mfaSecretEncrypted: undefined,
      mfaBackupCodesHashed: [],
    });

    return { mfaEnabled: false };
  },

  async regenerateBackupCodes(userId: string, password: string) {
    const user = await authRepository.findUserById(userId);
    if (!user || !user.isMfaEnabled) {
      throw new BadRequestError('Enable MFA before regenerating backup codes.');
    }
    const passOk = await verifyPassword(user.passwordHash, password);
    if (!passOk) {
      throw new UnauthorizedError('Invalid password.', 'INVALID_CREDENTIALS');
    }
    const { plaintextCodes, hashedCodes } = generateBackupCodes(8);
    await authRepository.updateUser(user.id, { mfaBackupCodesHashed: hashedCodes });
    return { backupCodes: plaintextCodes };
  },

  // 10. DEVICE/SESSION MANAGEMENT & LOGIN HISTORY
  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await authRepository.listUserSessions(userId);
    return sessions.map((s) => ({
      sessionId: s.sessionId,
      deviceLabel: s.deviceLabel,
      ipAddress: s.ipAddress,
      lastActivityAt: s.lastActivityAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      isCurrent: s.sessionId === currentSessionId,
    }));
  },

  async revokeSpecificSession(userId: string, targetSessionId: string) {
    const session = await authRepository.findSessionById(targetSessionId);
    if (!session || session.userId !== userId) {
      throw new NotFoundError('Session not found.');
    }
    await authRepository.revokeSession(targetSessionId, 'USER_DEVICE_REVOKED');
    return { revoked: true, sessionId: targetSessionId };
  },

  async getLoginHistory(userId: string) {
    const records = await authRepository.listUserLoginHistory(userId, 25);
    return records.map((r) => ({
      id: r.id,
      status: r.status,
      failureReason: r.failureReason,
      ipAddress: r.ipAddress,
      deviceLabel: r.deviceLabel,
      suspiciousSignals: r.suspiciousSignals,
      createdAt: r.createdAt.toISOString(),
    }));
  },

  // Helper constants exposed for cookie TTLs
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_MS,
};
