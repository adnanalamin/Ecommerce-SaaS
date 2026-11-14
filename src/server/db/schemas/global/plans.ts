/**
 * NEXORA Database Architecture
 * Global Subscription Plans Schema & Model
 */

import { Schema, model, Document, Types } from 'mongoose';

export type PlanCode = 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';

export interface IPlan extends Document {
  _id: Types.ObjectId;
  code: PlanCode;
  name: string;
  description: string;
  priceMonthlyUSD: number;
  priceMonthlyBDT: number;
  priceYearlyUSD: number;
  priceYearlyBDT: number;
  maxProducts: number;
  maxStaffUsers: number;
  maxStorageMB: number;
  customDomainAllowed: boolean;
  adSenseAllowed: boolean;
  transactionFeePercent: number;
  hasDedicatedDatabase: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const PlanSchema = new Schema<IPlan>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      enum: ['STARTER', 'GROWTH', 'PRO', 'ENTERPRISE'],
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    priceMonthlyUSD: {
      type: Number,
      required: true,
      default: 0,
    },
    priceMonthlyBDT: {
      type: Number,
      required: true,
      default: 0,
    },
    priceYearlyUSD: {
      type: Number,
      required: true,
      default: 0,
    },
    priceYearlyBDT: {
      type: Number,
      required: true,
      default: 0,
    },
    maxProducts: {
      type: Number,
      required: true,
      default: 50,
    },
    maxStaffUsers: {
      type: Number,
      required: true,
      default: 2,
    },
    maxStorageMB: {
      type: Number,
      required: true,
      default: 1024,
    },
    customDomainAllowed: {
      type: Boolean,
      default: false,
    },
    adSenseAllowed: {
      type: Boolean,
      default: false,
    },
    transactionFeePercent: {
      type: Number,
      default: 2.0, // 2% on Starter, 0% on Pro/Enterprise
    },
    hasDedicatedDatabase: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'plans',
  }
);

export const PlanModel = model<IPlan>('Plan', PlanSchema);
