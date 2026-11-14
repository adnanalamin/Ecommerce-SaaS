/**
 * NEXORA Database Architecture
 * Subscriptions, Coupons, Reviews & Advertisements Schemas
 */

import { Schema, model, Document, Types } from 'mongoose';
import { tenantIsolationPlugin } from '../../plugins/tenantIsolation.ts';

// 1. TENANT SUBSCRIPTIONS COLLECTION (SaaS Billing Ledger)
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED';

export interface ISubscription extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  planId: Types.ObjectId;
  status: SubscriptionStatus;
  billingCycle: 'MONTHLY' | 'YEARLY';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  gateway?: string;
  gatewaySubscriptionId?: string;
  cancelAtPeriodEnd: boolean;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const SubscriptionSchema = new Schema<ISubscription>(
  {
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true, index: true },
    status: {
      type: String,
      enum: ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED'],
      default: 'TRIAL',
      index: true,
    },
    billingCycle: { type: String, enum: ['MONTHLY', 'YEARLY'], default: 'MONTHLY' },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    gateway: { type: String },
    gatewaySubscriptionId: { type: String },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    cancelledAt: { type: Date },
  },
  { timestamps: true, collection: 'subscriptions' }
);
SubscriptionSchema.plugin(tenantIsolationPlugin);
SubscriptionSchema.index({ tenantId: 1, status: 1 });
export const SubscriptionModel = model<ISubscription>('Subscription', SubscriptionSchema);

// 2. COUPONS COLLECTION (Discount & Promotion Engine)
export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';

export interface ICoupon extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmountBDT?: number;
  maxDiscountAmountBDT?: number;
  usageLimitTotal?: number;
  usageLimitPerCustomer?: number;
  usageCount: number;
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const CouponSchema = new Schema<ICoupon>(
  {
    code: { type: String, required: true, trim: true, uppercase: true },
    discountType: { type: String, enum: ['PERCENTAGE', 'FIXED_AMOUNT'], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    minOrderAmountBDT: { type: Number, min: 0 },
    maxDiscountAmountBDT: { type: Number, min: 0 },
    usageLimitTotal: { type: Number, min: 1 },
    usageLimitPerCustomer: { type: Number, default: 1, min: 1 },
    usageCount: { type: Number, default: 0, min: 0 },
    validFrom: { type: Date, required: true },
    validUntil: { type: Date, required: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'coupons' }
);
CouponSchema.plugin(tenantIsolationPlugin);
CouponSchema.index({ tenantId: 1, code: 1 }, { unique: true });
export const CouponModel = model<ICoupon>('Coupon', CouponSchema);

// 3. REVIEWS COLLECTION (Verified Customer Reviews)
export interface IReview extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  productId: Types.ObjectId;
  customerId: Types.ObjectId;
  orderId?: Types.ObjectId;
  rating: number;
  title?: string;
  comment: string;
  isVerifiedPurchase: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: Date;
  updatedAt: Date;
}

export const ReviewSchema = new Schema<IReview>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 100 },
    comment: { type: String, required: true, trim: true, maxlength: 2000 },
    isVerifiedPurchase: { type: Boolean, default: false },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'APPROVED', index: true },
  },
  { timestamps: true, collection: 'reviews' }
);
ReviewSchema.plugin(tenantIsolationPlugin);
ReviewSchema.index({ tenantId: 1, productId: 1, status: 1 });
ReviewSchema.index({ tenantId: 1, customerId: 1, productId: 1 }, { unique: true });
export const ReviewModel = model<IReview>('Review', ReviewSchema);

// 4. ADVERTISEMENTS COLLECTION (AdSense & Banner Placements)
export interface IAdUnit {
  slotId: string;
  placement: 'HEADER_LEADERBOARD' | 'SIDEBAR_RECTANGLE' | 'IN_FEED_NATIVE' | 'AFTER_PRODUCT_DETAILS' | 'FOOTER_BANNER';
  format: 'auto' | 'rectangle' | 'horizontal' | 'vertical';
  isActive: boolean;
}

export interface IAdvertisement extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  isEnabled: boolean;
  publisherId: string;
  autoAdsEnabled: boolean;
  isConsentBannerEnabled: boolean;
  adUnits: IAdUnit[];
  excludedRoutes: string[];
  createdAt: Date;
  updatedAt: Date;
}

export const AdvertisementSchema = new Schema<IAdvertisement>(
  {
    isEnabled: { type: Boolean, default: false, index: true },
    publisherId: { type: String, trim: true },
    autoAdsEnabled: { type: Boolean, default: false },
    isConsentBannerEnabled: { type: Boolean, default: true },
    adUnits: [
      {
        slotId: { type: String, required: true },
        placement: {
          type: String,
          required: true,
          enum: ['HEADER_LEADERBOARD', 'SIDEBAR_RECTANGLE', 'IN_FEED_NATIVE', 'AFTER_PRODUCT_DETAILS', 'FOOTER_BANNER'],
        },
        format: { type: String, enum: ['auto', 'rectangle', 'horizontal', 'vertical'], default: 'auto' },
        isActive: { type: Boolean, default: true },
      },
    ],
    excludedRoutes: {
      type: [String],
      default: ['/checkout', '/cart', '/account', '/payment', '/orders/confirmed'],
    },
  },
  { timestamps: true, collection: 'advertisements' }
);
AdvertisementSchema.plugin(tenantIsolationPlugin);
AdvertisementSchema.index({ tenantId: 1 }, { unique: true });
export const AdvertisementModel = model<IAdvertisement>('Advertisement', AdvertisementSchema);
