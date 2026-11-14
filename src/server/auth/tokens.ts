/**
 * NEXORA Authentication Engine
 * JWT Access Tokens (jose HS256), MFA Challenge Tickets & Opaque Refresh/Reset Tokens
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../../../packages/config/src/index.ts';
import type { UserType } from '../db/schemas/global/users.ts';

const JWT_ISSUER = 'nexora.auth';
const JWT_AUDIENCE = 'nexora.platform';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes short-lived access token
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days server-managed session
export const MFA_TICKET_TTL_SECONDS = 5 * 60; // 5 minutes
export const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  role: UserType;
  tv: number; // tokenVersion for instant global revocation
  purpose: 'ACCESS';
}

export interface MfaTicketPayload {
  sub: string;
  purpose: 'MFA_CHALLENGE';
}

function getAccessSecretKey(): Uint8Array {
  return new TextEncoder().encode(env.JWT_ACCESS_SECRET);
}

function getMfaSecretKey(): Uint8Array {
  return new TextEncoder().encode(env.JWT_REFRESH_SECRET);
}

export async function signAccessToken(
  params: { userId: string; sessionId: string; role: UserType; tokenVersion: number },
  ttlSeconds = ACCESS_TOKEN_TTL_SECONDS
): Promise<string> {
  return new SignJWT({
    sid: params.sessionId,
    role: params.role,
    tv: params.tokenVersion,
    purpose: 'ACCESS',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setSubject(params.userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(getAccessSecretKey());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, getAccessSecretKey(), {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithms: ['HS256'],
  });

  if (
    payload.purpose !== 'ACCESS' ||
    typeof payload.sub !== 'string' ||
    typeof payload.sid !== 'string' ||
    typeof payload.role !== 'string' ||
    typeof payload.tv !== 'number'
  ) {
    throw new Error('Invalid access token claims.');
  }

  return {
    sub: payload.sub,
    sid: payload.sid,
    role: payload.role as UserType,
    tv: payload.tv,
    purpose: 'ACCESS',
  };
}

export async function signMfaTicket(userId: string): Promise<string> {
  return new SignJWT({ purpose: 'MFA_CHALLENGE' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${MFA_TICKET_TTL_SECONDS}s`)
    .sign(getMfaSecretKey());
}

export async function verifyMfaTicket(ticket: string): Promise<MfaTicketPayload> {
  const { payload } = await jwtVerify(ticket, getMfaSecretKey(), {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithms: ['HS256'],
  });

  if (payload.purpose !== 'MFA_CHALLENGE' || typeof payload.sub !== 'string') {
    throw new Error('Invalid MFA challenge ticket.');
  }

  return {
    sub: payload.sub,
    purpose: 'MFA_CHALLENGE',
  };
}

/**
 * SHA-256 digest for storing opaque verification, reset, and refresh tokens without plaintext persistence.
 */
export function hashOpaqueToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function generateOpaqueToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString('hex');
  return {
    rawToken,
    tokenHash: hashOpaqueToken(rawToken),
  };
}

export function generateRefreshTokenPair(sessionId: string): { refreshToken: string; refreshTokenHash: string } {
  const secretPart = randomBytes(32).toString('base64url');
  const refreshToken = `${sessionId}.${secretPart}`;
  return {
    refreshToken,
    refreshTokenHash: hashOpaqueToken(refreshToken),
  };
}

export function extractSessionIdFromRefreshToken(refreshToken: string): string | null {
  if (!refreshToken || typeof refreshToken !== 'string') return null;
  const dotIdx = refreshToken.indexOf('.');
  if (dotIdx <= 0) return null;
  return refreshToken.slice(0, dotIdx);
}
