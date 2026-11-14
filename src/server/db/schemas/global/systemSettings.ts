/**
 * NEXORA Database Architecture
 * Global System Settings Schema & Model
 */

import { Schema, model, Document, Types } from 'mongoose';

export type SettingCategory = 'SECURITY' | 'BILLING' | 'NOTIFICATIONS' | 'GENERAL';

export interface ISystemSetting extends Document {
  _id: Types.ObjectId;
  key: string;
  value: unknown;
  description: string;
  category: SettingCategory;
  isPublic: boolean;
  updatedByUserId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const SystemSettingSchema = new Schema<ISystemSetting>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    value: {
      type: Schema.Types.Mixed,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ['SECURITY', 'BILLING', 'NOTIFICATIONS', 'GENERAL'],
      default: 'GENERAL',
      index: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
      index: true,
    },
    updatedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    collection: 'system_settings',
  }
);

export const SystemSettingModel = model<ISystemSetting>('SystemSetting', SystemSettingSchema);
