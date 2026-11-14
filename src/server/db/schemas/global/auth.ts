/**
 * NEXORA Authentication & Session Management Schemas
 * Global AuthSessions, AuthTokens (Verification/Reset), and LoginHistory Models
 */

import { Schema, model, Document, Types } from 'mongoose';

// 1. AUTH SESSIONS (Server-Managed Sessions + Refresh Token Rotation Family)
export interface IAuthSession extends Document {
  _id: Types.ObjectId;
  sessionId: string;
  userId: Types.ObjectId;
  familyId: string;
  tokenVersion: number;
  currentRefreshTokenHash: string;
  previousRefreshTokenHash?: string;
  deviceLabel: string;
  userAgent: string;
  userAgentHash: string;
  ipAddress: string;
  isRevoked: boolean;
  revokedAt?: Date;
  revokedReason?: string;
  lastActivityAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const AuthSessionSchema = new Schema<IAuthSession>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    familyId: { type: String, required: true, index: true },
    tokenVersion: { type: Number, required: true, default: 1 },
    currentRefreshTokenHash: { type: String, required: true, select: false },
    previousRefreshTokenHash: { type: String, select: false },
    deviceLabel: { type: String, required: true, trim: true, maxlength: 120 },
    userAgent: { type: String, required: true, maxlength: 512 },
    userAgentHash: { type: String, required: true, index: true },
    ipAddress: { type: String, required: true, trim: true },
    isRevoked: { type: Boolean, default: false, index: true },
    revokedAt: { type: Date },
    revokedReason: { type: String, trim: true },
    lastActivityAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL auto-cleanup
  },
  { timestamps: true, collection: 'auth_sessions' }
);

AuthSessionSchema.index({ userId: 1, isRevoked: 1, expiresAt: 1 });
export const AuthSessionModel = model<IAuthSession>('AuthSession', AuthSessionSchema);

// 2. AUTH TOKENS (Single-Use Email Verification & Password Reset Tokens)
export type AuthTokenType = 'EMAIL_VERIFY' | 'PASSWORD_RESET';

export interface IAuthToken extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: AuthTokenType;
  tokenHash: string;
  expiresAt: Date;
  consumedAt?: Date;
  createdAt: Date;
}

export const AuthTokenSchema = new Schema<IAuthToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['EMAIL_VERIFY', 'PASSWORD_RESET'], required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    consumedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'auth_tokens' }
);

AuthTokenSchema.index({ userId: 1, type: 1, consumedAt: 1 });
export const AuthTokenModel = model<IAuthToken>('AuthToken', AuthTokenSchema);

// 3. LOGIN HISTORY (Audit Trail & Suspicious Login Signals)
export type LoginHistoryStatus = 'SUCCESS' | 'FAILED' | 'LOCKED' | 'MFA_CHALLENGE' | 'SUSPICIOUS_FLAGGED';
export type SuspiciousSignal = 'NEW_IP_ADDRESS' | 'NEW_DEVICE_USER_AGENT' | 'RECENT_FAILED_ATTEMPTS' | 'POST_LOCKOUT_LOGIN';

export interface ILoginHistory extends Document {
  _id: Types.ObjectId;
  userId?: Types.ObjectId;
  email: string;
  sessionId?: string;
  status: LoginHistoryStatus;
  failureReason?: string;
  ipAddress: string;
  userAgent: string;
  deviceLabel: string;
  suspiciousSignals: SuspiciousSignal[];
  createdAt: Date;
}

export const LoginHistorySchema = new Schema<ILoginHistory>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    sessionId: { type: String, index: true },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILED', 'LOCKED', 'MFA_CHALLENGE', 'SUSPICIOUS_FLAGGED'],
      required: true,
      index: true,
    },
    failureReason: { type: String, trim: true },
    ipAddress: { type: String, required: true },
    userAgent: { type: String, required: true },
    deviceLabel: { type: String, required: true },
    suspiciousSignals: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'login_history' }
);

LoginHistorySchema.index({ userId: 1, createdAt: -1 });
export const LoginHistoryModel = model<ILoginHistory>('LoginHistory', LoginHistorySchema);
