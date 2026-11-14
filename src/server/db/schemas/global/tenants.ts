/**
 * NEXORA Database Architecture
 * Global Tenants Schema & Model
 */

import { Schema, model, Document, Types } from 'mongoose';
import { softDeletePlugin } from '../../plugins/softDelete.ts';

export type TenantStatus = 'PENDING_SETUP' | 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'ARCHIVED';
export type TenantTier = 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';
export type StoreOwnershipType = 'INDEPENDENT_TENANT' | 'PLATFORM_OWNED_OFFICIAL';
export type OnboardingStep =
  | 'REGISTERED'
  | 'EMAIL_VERIFIED'
  | 'BUSINESS_INFO_SAVED'
  | 'STORE_IDENTITY_SELECTED'
  | 'PLAN_ASSIGNED'
  | 'THEME_ASSIGNED'
  | 'SETTINGS_CREATED'
  | 'OWNER_MEMBERSHIP_CREATED'
  | 'COMPLETED';

export interface ITenant extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  subdomain: string;
  customDomain?: string;
  ownerUserId: Types.ObjectId;
  tier?: TenantTier;
  status: TenantStatus;
  storeOwnershipType: StoreOwnershipType;
  currentPlanId?: Types.ObjectId;
  trialEndsAt: Date;
  isOfficialStore: boolean;
  contactEmail?: string;
  contactPhone?: string;
  currency: 'BDT' | 'USD' | 'EUR' | 'GBP';
  locale: string;
  timezone: string;
  storageQuotaMB: number;
  storageUsedMB: number;
  dedicatedDbUri?: string; // Enterprise isolation routing
  businessInfo?: {
    legalName?: string;
    category?: string;
    country?: string;
    addressLine?: string;
  };
  onboardingProgress?: {
    currentStep: OnboardingStep;
    completedSteps: OnboardingStep[];
    startedAt: Date;
    completedAt?: Date;
  };
  idempotencyKey?: string;
  suspendedAt?: Date;
  suspendedReason?: string;
  suspendedByUserId?: Types.ObjectId;
  activatedAt?: Date;
  activatedByUserId?: Types.ObjectId;
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
      enum: ['PENDING_SETUP', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'ARCHIVED'],
      default: 'ACTIVE',
      index: true,
    },
    storeOwnershipType: {
      type: String,
      enum: ['INDEPENDENT_TENANT', 'PLATFORM_OWNED_OFFICIAL'],
      default: 'INDEPENDENT_TENANT',
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
    locale: {
      type: String,
      default: 'en-BD',
      trim: true,
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
    businessInfo: {
      legalName: { type: String, trim: true },
      category: { type: String, trim: true },
      country: { type: String, trim: true },
      addressLine: { type: String, trim: true },
    },
    onboardingProgress: {
      currentStep: { type: String, default: 'COMPLETED' },
      completedSteps: { type: [String], default: [] },
      startedAt: { type: Date },
      completedAt: { type: Date },
    },
    idempotencyKey: {
      type: String,
      trim: true,
    },
    suspendedAt: { type: Date },
    suspendedReason: { type: String, trim: true },
    suspendedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    activatedAt: { type: Date },
    activatedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    collection: 'tenants',
  }
);

TenantSchema.index({ ownerUserId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });
TenantSchema.plugin(softDeletePlugin);

export const TenantModel = model<ITenant>('Tenant', TenantSchema);
