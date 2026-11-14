/**
 * NEXORA RBAC & Governance Schemas
 * Staff Invitations and Global Admin Activity Audit Ledger
 */

import { Schema, model, Document, Types } from 'mongoose';

export type AdminActivityAction =
  | 'PLATFORM_ROLE_ASSIGNED'
  | 'PLATFORM_ROLE_REVOKED'
  | 'TENANT_ROLE_ASSIGNED'
  | 'TENANT_ROLE_UPDATED'
  | 'STAFF_INVITED'
  | 'STAFF_INVITE_ACCEPTED'
  | 'STAFF_INVITE_REVOKED'
  | 'MEMBERSHIP_REVOKED'
  | 'PRIVILEGE_ESCALATION_BLOCKED'
  | 'CROSS_TENANT_ACCESS_BLOCKED'
  | 'IDOR_OWNERSHIP_DENIED'
  | 'PERMISSION_DENIED'
  | 'RESOURCE_CREATED'
  | 'RESOURCE_UPDATED'
  | 'RESOURCE_DELETED';

export interface IStaffInvitation extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  storeId: Types.ObjectId;
  email: string;
  roleSlug: string;
  tokenHash: string;
  invitedByUserId: Types.ObjectId;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  expiresAt: Date;
  acceptedAt?: Date;
  acceptedByUserId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const StaffInvitationSchema = new Schema<IStaffInvitation>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    roleSlug: { type: String, required: true, lowercase: true, trim: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    invitedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'],
      default: 'PENDING',
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    acceptedAt: { type: Date },
    acceptedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'staff_invitations' }
);

StaffInvitationSchema.index({ tenantId: 1, email: 1, status: 1 });
export const StaffInvitationModel = model<IStaffInvitation>('StaffInvitation', StaffInvitationSchema);

export interface IAdminActivityLog extends Document {
  _id: Types.ObjectId;
  scope: 'PLATFORM' | 'TENANT' | 'STOREFRONT';
  tenantId?: string;
  actorUserId?: string;
  actorEmail?: string;
  actorRole: string;
  action: AdminActivityAction;
  resourceType: string;
  resourceId?: string;
  outcome: 'ALLOWED' | 'DENIED';
  reason?: string;
  ipAddress: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export const AdminActivityLogSchema = new Schema<IAdminActivityLog>(
  {
    scope: { type: String, enum: ['PLATFORM', 'TENANT', 'STOREFRONT'], required: true, index: true },
    tenantId: { type: String, index: true },
    actorUserId: { type: String, index: true },
    actorEmail: { type: String },
    actorRole: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, required: true, index: true },
    resourceId: { type: String },
    outcome: { type: String, enum: ['ALLOWED', 'DENIED'], required: true, index: true },
    reason: { type: String },
    ipAddress: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'admin_activity_logs' }
);

AdminActivityLogSchema.index({ createdAt: -1 });
AdminActivityLogSchema.index({ tenantId: 1, createdAt: -1 });
export const AdminActivityLogModel = model<IAdminActivityLog>('AdminActivityLog', AdminActivityLogSchema);
