/**
 * NEXORA Database Architecture
 * Global Users Schema & Model
 */

import { Schema, model, Document, Types } from 'mongoose';
import { softDeletePlugin } from '../../plugins/softDelete.ts';

export type UserType =
  | 'PLATFORM_SUPER_ADMIN'
  | 'PLATFORM_ADMIN'
  | 'PLATFORM_SUPPORT_AGENT'
  | 'PLATFORM_FINANCE_MANAGER'
  | 'MERCHANT'
  | 'CUSTOMER';
export type UserStatus = 'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED';

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  fullName: string;
  phone?: string;
  userType: UserType;
  status: UserStatus;
  isMfaEnabled: boolean;
  mfaSecretEncrypted?: string;
  mfaBackupCodesHashed?: string[];
  avatarUrl?: string;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  lastKnownUserAgentHash?: string;
  emailVerifiedAt?: Date;
  passwordChangedAt?: Date;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  tokenVersion: number;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // Omit from default queries for security
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    phone: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    userType: {
      type: String,
      enum: [
        'PLATFORM_SUPER_ADMIN',
        'PLATFORM_ADMIN',
        'PLATFORM_SUPPORT_AGENT',
        'PLATFORM_FINANCE_MANAGER',
        'MERCHANT',
        'CUSTOMER',
      ],
      default: 'CUSTOMER',
      index: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED'],
      default: 'ACTIVE',
      index: true,
    },
    isMfaEnabled: {
      type: Boolean,
      default: false,
    },
    mfaSecretEncrypted: {
      type: String,
      select: false,
    },
    mfaBackupCodesHashed: {
      type: [String],
      select: false,
      default: [],
    },
    avatarUrl: {
      type: String,
      trim: true,
    },
    lastLoginAt: {
      type: Date,
    },
    lastLoginIp: {
      type: String,
      trim: true,
    },
    lastKnownUserAgentHash: {
      type: String,
      select: false,
    },
    emailVerifiedAt: {
      type: Date,
    },
    passwordChangedAt: {
      type: Date,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lockedUntil: {
      type: Date,
    },
    tokenVersion: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  {
    timestamps: true,
    collection: 'users',
  }
);

UserSchema.plugin(softDeletePlugin);

export const UserModel = model<IUser>('User', UserSchema);
