/**
 * NEXORA Onboarding & Idempotent Provisioning Session Schema
 * Tracks 11-step business owner onboarding progress, business metadata,
 * idempotency keys, and atomic provisioning outcomes.
 */

import { Schema, model, Document, Types } from 'mongoose';
import type { OnboardingStep } from './tenants.ts';

export type OnboardingSessionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED_ROLLED_BACK';

export interface IOnboardingSession extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  email: string;
  status: OnboardingSessionStatus;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  businessInfo?: {
    legalBusinessName: string;
    category: string;
    phone?: string;
    contactEmail: string;
    country: string;
    currency: 'BDT' | 'USD' | 'EUR' | 'GBP';
    locale: string;
    timezone: string;
  };
  storeDraft?: {
    storeName: string;
    storeSlug: string;
    themeCode: string;
  };
  lastIdempotencyKey?: string;
  provisionedTenantId?: Types.ObjectId;
  provisionedStoreId?: Types.ObjectId;
  provisionedSlug?: string;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const OnboardingSessionSchema = new Schema<IOnboardingSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    status: {
      type: String,
      enum: ['IN_PROGRESS', 'COMPLETED', 'FAILED_ROLLED_BACK'],
      default: 'IN_PROGRESS',
      index: true,
    },
    currentStep: { type: String, default: 'REGISTERED' },
    completedSteps: { type: [String], default: ['REGISTERED'] },
    businessInfo: {
      legalBusinessName: { type: String, trim: true },
      category: { type: String, trim: true },
      phone: { type: String, trim: true },
      contactEmail: { type: String, trim: true, lowercase: true },
      country: { type: String, trim: true },
      currency: { type: String, enum: ['BDT', 'USD', 'EUR', 'GBP'] },
      locale: { type: String, trim: true },
      timezone: { type: String, trim: true },
    },
    storeDraft: {
      storeName: { type: String, trim: true },
      storeSlug: { type: String, trim: true, lowercase: true },
      themeCode: { type: String, trim: true },
    },
    lastIdempotencyKey: { type: String, trim: true },
    provisionedTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    provisionedStoreId: { type: Schema.Types.ObjectId, ref: 'Store' },
    provisionedSlug: { type: String, trim: true, lowercase: true },
    lastError: { type: String },
  },
  { timestamps: true, collection: 'onboarding_sessions' }
);

export const OnboardingSessionModel = model<IOnboardingSession>('OnboardingSession', OnboardingSessionSchema);
