/**
 * NEXORA Authentication Engine - Dual-Mode Repository
 * Persists to MongoDB via Mongoose when connected, or uses an isolated
 * in-memory store in standalone sandbox environments.
 */

import { Types } from 'mongoose';
import { isDatabaseConnected } from '../config/database.ts';
import {
  UserModel,
  type UserType,
  type UserStatus,
  AuthSessionModel,
  AuthTokenModel,
  type AuthTokenType,
  LoginHistoryModel,
  type LoginHistoryStatus,
  type SuspiciousSignal,
} from '../db/models.ts';

export interface AuthUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  phone?: string;
  userType: UserType;
  status: UserStatus;
  isMfaEnabled: boolean;
  mfaSecretEncrypted?: string;
  mfaBackupCodesHashed: string[];
  lastLoginAt?: Date;
  lastLoginIp?: string;
  lastKnownUserAgentHash?: string;
  emailVerifiedAt?: Date;
  passwordChangedAt?: Date;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthSessionRecord {
  id: string;
  sessionId: string;
  userId: string;
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
}

export interface AuthTokenRecord {
  id: string;
  userId: string;
  type: AuthTokenType;
  tokenHash: string;
  expiresAt: Date;
  consumedAt?: Date;
  createdAt: Date;
}

export interface LoginHistoryRecord {
  id: string;
  userId?: string;
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

// ==========================================
// SANDBOX IN-MEMORY STORE (When mongod is offline)
// ==========================================
const sandboxUsersById = new Map<string, AuthUserRecord>();
const sandboxUsersByEmail = new Map<string, string>();
const sandboxSessionsById = new Map<string, AuthSessionRecord>();
const sandboxTokensByHash = new Map<string, AuthTokenRecord>();
const sandboxLoginHistory: LoginHistoryRecord[] = [];

function toUserRecord(doc: any): AuthUserRecord {
  return {
    id: doc._id.toString(),
    email: doc.email,
    passwordHash: doc.passwordHash,
    fullName: doc.fullName,
    phone: doc.phone,
    userType: doc.userType,
    status: doc.status,
    isMfaEnabled: Boolean(doc.isMfaEnabled),
    mfaSecretEncrypted: doc.mfaSecretEncrypted,
    mfaBackupCodesHashed: Array.isArray(doc.mfaBackupCodesHashed) ? [...doc.mfaBackupCodesHashed] : [],
    lastLoginAt: doc.lastLoginAt,
    lastLoginIp: doc.lastLoginIp,
    lastKnownUserAgentHash: doc.lastKnownUserAgentHash,
    emailVerifiedAt: doc.emailVerifiedAt,
    passwordChangedAt: doc.passwordChangedAt,
    failedLoginAttempts: doc.failedLoginAttempts ?? 0,
    lockedUntil: doc.lockedUntil,
    tokenVersion: doc.tokenVersion ?? 1,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toSessionRecord(doc: any): AuthSessionRecord {
  return {
    id: doc._id.toString(),
    sessionId: doc.sessionId,
    userId: doc.userId.toString(),
    familyId: doc.familyId,
    tokenVersion: doc.tokenVersion,
    currentRefreshTokenHash: doc.currentRefreshTokenHash,
    previousRefreshTokenHash: doc.previousRefreshTokenHash,
    deviceLabel: doc.deviceLabel,
    userAgent: doc.userAgent,
    userAgentHash: doc.userAgentHash,
    ipAddress: doc.ipAddress,
    isRevoked: Boolean(doc.isRevoked),
    revokedAt: doc.revokedAt,
    revokedReason: doc.revokedReason,
    lastActivityAt: doc.lastActivityAt,
    expiresAt: doc.expiresAt,
    createdAt: doc.createdAt,
  };
}

export const authRepository = {
  // ---------- USERS ----------
  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const normalized = email.trim().toLowerCase();
    if (isDatabaseConnected()) {
      const doc = await UserModel.findOne({ email: normalized })
        .select('+passwordHash +mfaSecretEncrypted +mfaBackupCodesHashed +lastKnownUserAgentHash');
      return doc ? toUserRecord(doc) : null;
    }
    const uid = sandboxUsersByEmail.get(normalized);
    if (!uid) return null;
    const rec = sandboxUsersById.get(uid);
    return rec ? { ...rec, mfaBackupCodesHashed: [...rec.mfaBackupCodesHashed] } : null;
  },

  async findUserById(userId: string): Promise<AuthUserRecord | null> {
    if (isDatabaseConnected()) {
      if (!Types.ObjectId.isValid(userId)) return null;
      const doc = await UserModel.findById(userId)
        .select('+passwordHash +mfaSecretEncrypted +mfaBackupCodesHashed +lastKnownUserAgentHash');
      return doc ? toUserRecord(doc) : null;
    }
    const rec = sandboxUsersById.get(userId);
    return rec ? { ...rec, mfaBackupCodesHashed: [...rec.mfaBackupCodesHashed] } : null;
  },

  async createUser(input: {
    email: string;
    passwordHash: string;
    fullName: string;
    phone?: string;
    userType: UserType;
    status: UserStatus;
  }): Promise<AuthUserRecord> {
    const normalized = input.email.trim().toLowerCase();
    if (isDatabaseConnected()) {
      const doc = await UserModel.create({
        email: normalized,
        passwordHash: input.passwordHash,
        fullName: input.fullName,
        phone: input.phone,
        userType: input.userType,
        status: input.status,
        failedLoginAttempts: 0,
        tokenVersion: 1,
      });
      return toUserRecord(doc);
    }

    const id = new Types.ObjectId().toString();
    const now = new Date();
    const record: AuthUserRecord = {
      id,
      email: normalized,
      passwordHash: input.passwordHash,
      fullName: input.fullName,
      phone: input.phone,
      userType: input.userType,
      status: input.status,
      isMfaEnabled: false,
      mfaBackupCodesHashed: [],
      failedLoginAttempts: 0,
      tokenVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    sandboxUsersById.set(id, record);
    sandboxUsersByEmail.set(normalized, id);
    return { ...record };
  },

  async updateUser(
    userId: string,
    patch: Partial<Omit<AuthUserRecord, 'id' | 'email' | 'createdAt'>> & { unsetLockedUntil?: boolean }
  ): Promise<AuthUserRecord | null> {
    if (isDatabaseConnected()) {
      const { unsetLockedUntil, ...setFields } = patch;
      const updateOp: Record<string, any> = { $set: setFields };
      if (unsetLockedUntil) {
        updateOp.$unset = { lockedUntil: '' };
      }
      const doc = await UserModel.findByIdAndUpdate(userId, updateOp, { returnDocument: 'after' })
        .select('+passwordHash +mfaSecretEncrypted +mfaBackupCodesHashed +lastKnownUserAgentHash');
      return doc ? toUserRecord(doc) : null;
    }

    const existing = sandboxUsersById.get(userId);
    if (!existing) return null;
    const { unsetLockedUntil, ...rest } = patch;
    const updated: AuthUserRecord = {
      ...existing,
      ...rest,
      updatedAt: new Date(),
    };
    if (unsetLockedUntil) {
      delete updated.lockedUntil;
    }
    sandboxUsersById.set(userId, updated);
    return { ...updated, mfaBackupCodesHashed: [...updated.mfaBackupCodesHashed] };
  },

  // ---------- SESSIONS ----------
  async createSession(input: Omit<AuthSessionRecord, 'id' | 'createdAt' | 'isRevoked' | 'lastActivityAt'>): Promise<AuthSessionRecord> {
    if (isDatabaseConnected()) {
      const doc = await AuthSessionModel.create({
        ...input,
        userId: new Types.ObjectId(input.userId),
        isRevoked: false,
        lastActivityAt: new Date(),
      });
      return toSessionRecord(doc);
    }

    const now = new Date();
    const rec: AuthSessionRecord = {
      ...input,
      id: new Types.ObjectId().toString(),
      isRevoked: false,
      lastActivityAt: now,
      createdAt: now,
    };
    sandboxSessionsById.set(rec.sessionId, rec);
    return { ...rec };
  },

  async findSessionById(sessionId: string): Promise<AuthSessionRecord | null> {
    if (isDatabaseConnected()) {
      const doc = await AuthSessionModel.findOne({ sessionId })
        .select('+currentRefreshTokenHash +previousRefreshTokenHash');
      return doc ? toSessionRecord(doc) : null;
    }
    const rec = sandboxSessionsById.get(sessionId);
    return rec ? { ...rec } : null;
  },

  async listUserSessions(userId: string): Promise<AuthSessionRecord[]> {
    const now = new Date();
    if (isDatabaseConnected()) {
      const docs = await AuthSessionModel.find({
        userId: new Types.ObjectId(userId),
        isRevoked: false,
        expiresAt: { $gt: now },
      }).sort({ lastActivityAt: -1 });
      return docs.map(toSessionRecord);
    }

    return Array.from(sandboxSessionsById.values())
      .filter((s) => s.userId === userId && !s.isRevoked && s.expiresAt > now)
      .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime())
      .map((s) => ({ ...s }));
  },

  async rotateSessionRefreshToken(params: {
    sessionId: string;
    newRefreshTokenHash: string;
    previousRefreshTokenHash: string;
    newExpiresAt: Date;
    ipAddress: string;
  }): Promise<AuthSessionRecord | null> {
    if (isDatabaseConnected()) {
      const doc = await AuthSessionModel.findOneAndUpdate(
        { sessionId: params.sessionId, isRevoked: false },
        {
          $set: {
            previousRefreshTokenHash: params.previousRefreshTokenHash,
            currentRefreshTokenHash: params.newRefreshTokenHash,
            expiresAt: params.newExpiresAt,
            ipAddress: params.ipAddress,
            lastActivityAt: new Date(),
          },
        },
        { returnDocument: 'after' }
      ).select('+currentRefreshTokenHash +previousRefreshTokenHash');
      return doc ? toSessionRecord(doc) : null;
    }

    const rec = sandboxSessionsById.get(params.sessionId);
    if (!rec || rec.isRevoked) return null;
    const updated: AuthSessionRecord = {
      ...rec,
      previousRefreshTokenHash: params.previousRefreshTokenHash,
      currentRefreshTokenHash: params.newRefreshTokenHash,
      expiresAt: params.newExpiresAt,
      ipAddress: params.ipAddress,
      lastActivityAt: new Date(),
    };
    sandboxSessionsById.set(params.sessionId, updated);
    return { ...updated };
  },

  async revokeSession(sessionId: string, reason: string): Promise<boolean> {
    const now = new Date();
    if (isDatabaseConnected()) {
      const res = await AuthSessionModel.updateOne(
        { sessionId, isRevoked: false },
        { $set: { isRevoked: true, revokedAt: now, revokedReason: reason } }
      );
      return res.modifiedCount > 0;
    }

    const rec = sandboxSessionsById.get(sessionId);
    if (!rec || rec.isRevoked) return false;
    rec.isRevoked = true;
    rec.revokedAt = now;
    rec.revokedReason = reason;
    sandboxSessionsById.set(sessionId, rec);
    return true;
  },

  async revokeAllUserSessions(userId: string, reason: string, exceptSessionId?: string): Promise<number> {
    const now = new Date();
    if (isDatabaseConnected()) {
      const filter: Record<string, any> = {
        userId: new Types.ObjectId(userId),
        isRevoked: false,
      };
      if (exceptSessionId) {
        filter.sessionId = { $ne: exceptSessionId };
      }
      const res = await AuthSessionModel.updateMany(filter, {
        $set: { isRevoked: true, revokedAt: now, revokedReason: reason },
      });
      return res.modifiedCount;
    }

    let count = 0;
    for (const [sid, rec] of sandboxSessionsById.entries()) {
      if (rec.userId === userId && !rec.isRevoked && sid !== exceptSessionId) {
        rec.isRevoked = true;
        rec.revokedAt = now;
        rec.revokedReason = reason;
        count++;
      }
    }
    return count;
  },

  // ---------- AUTH TOKENS (EMAIL VERIFY / PASSWORD RESET) ----------
  async createAuthToken(input: {
    userId: string;
    type: AuthTokenType;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<AuthTokenRecord> {
    if (isDatabaseConnected()) {
      const doc = await AuthTokenModel.create({
        userId: new Types.ObjectId(input.userId),
        type: input.type,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      });
      return {
        id: doc._id.toString(),
        userId: doc.userId.toString(),
        type: doc.type,
        tokenHash: doc.tokenHash,
        expiresAt: doc.expiresAt,
        consumedAt: doc.consumedAt,
        createdAt: doc.createdAt,
      };
    }

    const rec: AuthTokenRecord = {
      id: new Types.ObjectId().toString(),
      userId: input.userId,
      type: input.type,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdAt: new Date(),
    };
    sandboxTokensByHash.set(input.tokenHash, rec);
    return { ...rec };
  },

  async findTokenByHash(tokenHash: string, type: AuthTokenType): Promise<AuthTokenRecord | null> {
    if (isDatabaseConnected()) {
      const doc = await AuthTokenModel.findOne({ tokenHash, type });
      if (!doc) return null;
      return {
        id: doc._id.toString(),
        userId: doc.userId.toString(),
        type: doc.type,
        tokenHash: doc.tokenHash,
        expiresAt: doc.expiresAt,
        consumedAt: doc.consumedAt,
        createdAt: doc.createdAt,
      };
    }

    const rec = sandboxTokensByHash.get(tokenHash);
    if (!rec || rec.type !== type) return null;
    return { ...rec };
  },

  async consumeAuthToken(tokenHash: string): Promise<void> {
    const now = new Date();
    if (isDatabaseConnected()) {
      await AuthTokenModel.updateOne({ tokenHash }, { $set: { consumedAt: now } });
      return;
    }
    const rec = sandboxTokensByHash.get(tokenHash);
    if (rec) {
      rec.consumedAt = now;
    }
  },

  async invalidateTokensForUser(userId: string, type: AuthTokenType): Promise<void> {
    const now = new Date();
    if (isDatabaseConnected()) {
      await AuthTokenModel.updateMany(
        { userId: new Types.ObjectId(userId), type, consumedAt: { $exists: false } },
        { $set: { consumedAt: now } }
      );
      return;
    }
    for (const rec of sandboxTokensByHash.values()) {
      if (rec.userId === userId && rec.type === type && !rec.consumedAt) {
        rec.consumedAt = now;
      }
    }
  },

  // ---------- LOGIN HISTORY ----------
  async recordLoginHistory(input: Omit<LoginHistoryRecord, 'id' | 'createdAt'>): Promise<LoginHistoryRecord> {
    if (isDatabaseConnected()) {
      const doc = await LoginHistoryModel.create({
        ...input,
        userId: input.userId ? new Types.ObjectId(input.userId) : undefined,
      });
      return {
        id: doc._id.toString(),
        userId: doc.userId?.toString(),
        email: doc.email,
        sessionId: doc.sessionId,
        status: doc.status,
        failureReason: doc.failureReason,
        ipAddress: doc.ipAddress,
        userAgent: doc.userAgent,
        deviceLabel: doc.deviceLabel,
        suspiciousSignals: doc.suspiciousSignals,
        createdAt: doc.createdAt,
      };
    }

    const rec: LoginHistoryRecord = {
      ...input,
      id: new Types.ObjectId().toString(),
      createdAt: new Date(),
    };
    sandboxLoginHistory.unshift(rec);
    if (sandboxLoginHistory.length > 500) {
      sandboxLoginHistory.pop();
    }
    return { ...rec };
  },

  async listUserLoginHistory(userId: string, limit = 20): Promise<LoginHistoryRecord[]> {
    if (isDatabaseConnected()) {
      const docs = await LoginHistoryModel.find({ userId: new Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .limit(limit);
      return docs.map((doc) => ({
        id: doc._id.toString(),
        userId: doc.userId?.toString(),
        email: doc.email,
        sessionId: doc.sessionId,
        status: doc.status,
        failureReason: doc.failureReason,
        ipAddress: doc.ipAddress,
        userAgent: doc.userAgent,
        deviceLabel: doc.deviceLabel,
        suspiciousSignals: doc.suspiciousSignals,
        createdAt: doc.createdAt,
      }));
    }

    return sandboxLoginHistory
      .filter((h) => h.userId === userId)
      .slice(0, limit)
      .map((h) => ({ ...h }));
  },

  async listAllUsers(): Promise<AuthUserRecord[]> {
    if (isDatabaseConnected()) {
      const docs = await UserModel.find({}).sort({ createdAt: -1 });
      return docs.map(toUserRecord);
    }
    return Array.from(sandboxUsersById.values())
      .map((u) => ({ ...u, mfaBackupCodesHashed: [...u.mfaBackupCodesHashed] }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  async listRecentLoginHistory(limit = 60): Promise<LoginHistoryRecord[]> {
    if (isDatabaseConnected()) {
      const docs = await LoginHistoryModel.find({}).sort({ createdAt: -1 }).limit(limit);
      return docs.map((doc) => ({
        id: doc._id.toString(),
        userId: doc.userId?.toString(),
        email: doc.email,
        sessionId: doc.sessionId,
        status: doc.status,
        failureReason: doc.failureReason,
        ipAddress: doc.ipAddress,
        userAgent: doc.userAgent,
        deviceLabel: doc.deviceLabel,
        suspiciousSignals: doc.suspiciousSignals,
        createdAt: doc.createdAt,
      }));
    }
    return sandboxLoginHistory.slice(0, limit).map((h) => ({ ...h }));
  },

  async countActiveSessions(): Promise<number> {
    const now = new Date();
    if (isDatabaseConnected()) {
      return AuthSessionModel.countDocuments({ isRevoked: false, expiresAt: { $gt: now } });
    }
    let count = 0;
    for (const s of sandboxSessionsById.values()) {
      if (!s.isRevoked && s.expiresAt > now) count++;
    }
    return count;
  },
};
