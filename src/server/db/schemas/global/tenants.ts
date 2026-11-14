/**
 * NEXORA Database Architecture
 * Global Tenants Schema & Model
 */

import { Schema, model, Document, Types } from 'mongoose';
import { softDeletePlugin } from '../../plugins/softDelete.ts';

export type TenantStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'ARCHIVED';
export type TenantTier = 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';

export interface ITenant extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  subdomain: string;
  customDomain?: string;
  ownerUserId: Types.ObjectId;
  tier?: TenantTier;
  status: TenantStatus;
  currentPlanId?: Types.ObjectId;
  trialEndsAt: Date;
  isOfficialStore: boolean;
  contactEmail?: string;
  contactPhone?: string;
  currency: 'BDT' | 'USD' | 'EUR' | 'GBP';
  timezone: string;
  storageQuotaMB: number;
  storageUsedMB: number;
  dedicatedDbUri?: string; // Enterprise isolation routing
  settings?: Record<string, any>;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const TenantSchema = new Schema<ITenant>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    subdomain: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    customDomain: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tier: {
      type: String,
      enum: ['STARTER', 'GROWTH', 'PRO', 'ENTERPRISE'],
      default: 'STARTER',
      index: true,
    },
    status: {
      type: String,
      enum: ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'ARCHIVED'],
      default: 'TRIAL',
      index: true,
    },
    currentPlanId: {
      type: Schema.Types.ObjectId,
      ref: 'Plan',
      index: true,
    },
    settings: {
      type: Schema.Types.Mixed,
      default: {},
    },
    trialEndsAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14-day trial
    },
    isOfficialStore: {
      type: Boolean,
      default: false,
      index: true,
    },
    contactEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    contactPhone: {
      type: String,
      trim: true,
    },
    currency: {
      type: String,
      enum: ['BDT', 'USD', 'EUR', 'GBP'],
      default: 'BDT',
    },
    timezone: {
      type: String,
      default: 'Asia/Dhaka',
    },
    storageQuotaMB: {
      type: Number,
      default: 1024, // 1 GB default
    },
    storageUsedMB: {
      type: Number,
      default: 0,
    },
    dedicatedDbUri: {
      type: String,
      select: false, // Protected connection string for enterprise tier
    },
  },
  {
    timestamps: true,
    collection: 'tenants',
  }
);

TenantSchema.plugin(softDeletePlugin);

export const TenantModel = model<ITenant>('Tenant', TenantSchema);
