/**
 * NEXORA Platform Governance & Controlled Support Access Schemas
 * Support Tickets & Time-Bounded, Logged Support Access Grants
 */

import { Schema, model, Document, Types } from 'mongoose';

export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_MERCHANT' | 'RESOLVED' | 'CLOSED';
export type SupportTicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type SupportTicketCategory = 'BILLING' | 'TECHNICAL' | 'DOMAIN' | 'SECURITY' | 'GENERAL';
export type SupportAccessScope = 'READ_DIAGNOSTICS' | 'ORDER_ASSIST';
export type SupportAccessStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export interface ISupportTicketMessage {
  authorEmail: string;
  authorRole: string;
  body: string;
  createdAt: Date;
}

export interface ISupportTicket extends Document {
  _id: Types.ObjectId;
  ticketNumber: string;
  tenantId: string;
  tenantName: string;
  requesterUserId?: string;
  requesterEmail: string;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  assignedAgentUserId?: string;
  assignedAgentEmail?: string;
  messages: ISupportTicketMessage[];
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const SupportTicketSchema = new Schema<ISupportTicket>(
  {
    ticketNumber: { type: String, required: true, unique: true, trim: true, index: true },
    tenantId: { type: String, required: true, index: true },
    tenantName: { type: String, required: true, trim: true },
    requesterUserId: { type: String, index: true },
    requesterEmail: { type: String, required: true, trim: true, lowercase: true },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    category: {
      type: String,
      enum: ['BILLING', 'TECHNICAL', 'DOMAIN', 'SECURITY', 'GENERAL'],
      default: 'GENERAL',
      index: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
      default: 'MEDIUM',
      index: true,
    },
    status: {
      type: String,
      enum: ['OPEN', 'IN_PROGRESS', 'WAITING_MERCHANT', 'RESOLVED', 'CLOSED'],
      default: 'OPEN',
      index: true,
    },
    assignedAgentUserId: { type: String },
    assignedAgentEmail: { type: String },
    messages: [
      {
        authorEmail: { type: String, required: true },
        authorRole: { type: String, required: true },
        body: { type: String, required: true, maxlength: 2000 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    resolvedAt: { type: Date },
  },
  { timestamps: true, collection: 'support_tickets' }
);

export const SupportTicketModel = model<ISupportTicket>('SupportTicket', SupportTicketSchema);

export interface ISupportAccessGrant extends Document {
  _id: Types.ObjectId;
  grantId: string;
  ticketId: string;
  ticketNumber: string;
  tenantId: string;
  tenantName: string;
  actorUserId: string;
  actorEmail: string;
  actorRole: string;
  accessScope: SupportAccessScope;
  reason: string;
  status: SupportAccessStatus;
  grantedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  revokedByEmail?: string;
  accessCount: number;
  lastAccessedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const SupportAccessGrantSchema = new Schema<ISupportAccessGrant>(
  {
    grantId: { type: String, required: true, unique: true, index: true },
    ticketId: { type: String, required: true, index: true },
    ticketNumber: { type: String, required: true },
    tenantId: { type: String, required: true, index: true },
    tenantName: { type: String, required: true },
    actorUserId: { type: String, required: true, index: true },
    actorEmail: { type: String, required: true },
    actorRole: { type: String, required: true },
    accessScope: {
      type: String,
      enum: ['READ_DIAGNOSTICS', 'ORDER_ASSIST'],
      default: 'READ_DIAGNOSTICS',
    },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: ['ACTIVE', 'REVOKED', 'EXPIRED'],
      default: 'ACTIVE',
      index: true,
    },
    grantedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date },
    revokedByEmail: { type: String },
    accessCount: { type: Number, default: 0 },
    lastAccessedAt: { type: Date },
  },
  { timestamps: true, collection: 'support_access_grants' }
);

SupportAccessGrantSchema.index({ actorUserId: 1, tenantId: 1, status: 1 });
export const SupportAccessGrantModel = model<ISupportAccessGrant>(
  'SupportAccessGrant',
  SupportAccessGrantSchema
);
