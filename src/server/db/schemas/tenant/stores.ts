/**
 * NEXORA Database Architecture
 * Tenant Storefront, Roles, Permissions & Memberships Schemas
 */

import { Schema, model, Document, Types } from 'mongoose';
import { tenantIsolationPlugin } from '../../plugins/tenantIsolation.ts';
import { softDeletePlugin } from '../../plugins/softDelete.ts';

// 1. STORES COLLECTION (Tenant-Owned Storefront Instance)
export interface IStore extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  faviconUrl?: string;
  contactEmail: string;
  contactPhone?: string;
  currency: 'BDT' | 'USD' | 'EUR' | 'GBP';
  locale: string;
  timezone: string;
  status: 'PENDING_SETUP' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  defaultThemeCode: string;
  businessCategory?: string;
  isOfficialStore: boolean;
  isMaintenanceMode: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const StoreSchema = new Schema<IStore>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, trim: true },
    logoUrl: { type: String, trim: true },
    faviconUrl: { type: String, trim: true },
    contactEmail: { type: String, required: true, trim: true, lowercase: true },
    contactPhone: { type: String, trim: true },
    currency: { type: String, enum: ['BDT', 'USD', 'EUR', 'GBP'], default: 'BDT' },
    locale: { type: String, default: 'en-BD', trim: true },
    timezone: { type: String, default: 'Asia/Dhaka' },
    status: {
      type: String,
      enum: ['PENDING_SETUP', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'],
      default: 'ACTIVE',
      index: true,
    },
    defaultThemeCode: { type: String, default: 'nexora-atelier', trim: true },
    businessCategory: { type: String, trim: true },
    isOfficialStore: { type: Boolean, default: false, index: true },
    isMaintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'stores' }
);
StoreSchema.plugin(tenantIsolationPlugin);
StoreSchema.plugin(softDeletePlugin);
StoreSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
export const StoreModel = model<IStore>('Store', StoreSchema);

// 2. PERMISSIONS COLLECTION (Permission Definition Catalog)
export type PermissionModule =
  | 'PLATFORM'
  | 'PRODUCTS'
  | 'INVENTORY'
  | 'ORDERS'
  | 'CUSTOMERS'
  | 'MARKETING'
  | 'THEMES'
  | 'FINTECH'
  | 'SETTINGS'
  | 'STAFF'
  | 'AUDIT';

export interface IPermission extends Document {
  _id: Types.ObjectId;
  code: string;
  name: string;
  description: string;
  module: PermissionModule;
  scope: 'PLATFORM' | 'TENANT' | 'STOREFRONT';
  createdAt: Date;
}

export const PermissionSchema = new Schema<IPermission>(
  {
    code: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    module: {
      type: String,
      required: true,
      enum: ['PLATFORM', 'PRODUCTS', 'INVENTORY', 'ORDERS', 'CUSTOMERS', 'MARKETING', 'THEMES', 'FINTECH', 'SETTINGS', 'STAFF', 'AUDIT'],
      index: true,
    },
    scope: {
      type: String,
      enum: ['PLATFORM', 'TENANT', 'STOREFRONT'],
      default: 'TENANT',
      index: true,
    },
  },
  { timestamps: true, collection: 'permissions' }
);
export const PermissionModel = model<IPermission>('Permission', PermissionSchema);

// 3. ROLES COLLECTION (Tenant-Owned Role Definitions)
export interface IRole extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  permissionCodes: string[];
  hierarchyRank: number;
  isSystemDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const RoleSchema = new Schema<IRole>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, trim: true },
    permissionCodes: { type: [String], default: [] },
    hierarchyRank: { type: Number, default: 10, min: 1, max: 100 },
    isSystemDefault: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'roles' }
);
RoleSchema.plugin(tenantIsolationPlugin);
RoleSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
export const RoleModel = model<IRole>('Role', RoleSchema);

// 4. STORE MEMBERSHIPS COLLECTION (User-to-Store Mapping & Staff)
export interface IStoreMembership extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  storeId: Types.ObjectId;
  roleId: Types.ObjectId;
  roleSlug: string;
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'REVOKED';
  invitedBy?: Types.ObjectId;
  revokedAt?: Date;
  revokedBy?: Types.ObjectId;
  joinedAt: Date;
}

export const StoreMembershipSchema = new Schema<IStoreMembership>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
    roleSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    status: { type: String, enum: ['ACTIVE', 'INVITED', 'SUSPENDED', 'REVOKED'], default: 'ACTIVE', index: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    revokedAt: { type: Date },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'store_memberships' }
);
StoreMembershipSchema.plugin(tenantIsolationPlugin);
StoreMembershipSchema.index({ tenantId: 1, userId: 1, storeId: 1 }, { unique: true });
export const StoreMembershipModel = model<IStoreMembership>('StoreMembership', StoreMembershipSchema);
