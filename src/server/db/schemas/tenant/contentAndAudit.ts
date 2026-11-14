/**
 * NEXORA Database Architecture
 * Themes, Branding, Media, CMS, Blogs, Notifications, Audit & Webhooks
 */

import { Schema, model, Document, Types } from 'mongoose';
import { tenantIsolationPlugin } from '../../plugins/tenantIsolation.ts';
import { softDeletePlugin } from '../../plugins/softDelete.ts';

// 1. THEMES COLLECTION (Dynamic Styling Snapshots)
export interface ITheme extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  activeVersion: number;
  publishedSnapshot: Record<string, unknown>;
  draftSnapshot: Record<string, unknown>;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const ThemeSchema = new Schema<ITheme>(
  {
    activeVersion: { type: Number, default: 1 },
    publishedSnapshot: { type: Schema.Types.Mixed, default: {} },
    draftSnapshot: { type: Schema.Types.Mixed, default: {} },
    publishedAt: { type: Date },
  },
  { timestamps: true, collection: 'themes' }
);
ThemeSchema.plugin(tenantIsolationPlugin);
ThemeSchema.index({ tenantId: 1 }, { unique: true });
export const ThemeModel = model<ITheme>('Theme', ThemeSchema);

// 2. BRANDING SETTINGS COLLECTION (Logos, Typography, Color Tokens)
export interface IBrandingSetting extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  logoUrl?: string;
  faviconUrl?: string;
  tagline?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
  borderRadius: string;
  customCss?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const BrandingSettingSchema = new Schema<IBrandingSetting>(
  {
    logoUrl: { type: String, trim: true },
    faviconUrl: { type: String, trim: true },
    tagline: { type: String, trim: true },
    primaryColor: { type: String, default: '#4F46E5' },
    secondaryColor: { type: String, default: '#F1F5F9' },
    accentColor: { type: String, default: '#0284C7' },
    fontHeading: { type: String, default: 'Plus Jakarta Sans' },
    fontBody: { type: String, default: 'Inter' },
    borderRadius: { type: String, default: '0.5rem' },
    customCss: { type: String },
  },
  { timestamps: true, collection: 'branding_settings' }
);
BrandingSettingSchema.plugin(tenantIsolationPlugin);
BrandingSettingSchema.index({ tenantId: 1 }, { unique: true });
export const BrandingSettingModel = model<IBrandingSetting>('BrandingSetting', BrandingSettingSchema);

// 3. MEDIA ASSETS COLLECTION (S3 / Cloud Storage Metadata)
export interface IMediaAsset extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  width?: number;
  height?: number;
  folder: string;
  uploadedByUserId?: Types.ObjectId;
  createdAt: Date;
}

export const MediaAssetSchema = new Schema<IMediaAsset>(
  {
    key: { type: String, required: true, trim: true },
    filename: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    url: { type: String, required: true },
    width: { type: Number },
    height: { type: Number },
    folder: { type: String, default: 'products' },
    uploadedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'media_assets' }
);
MediaAssetSchema.plugin(tenantIsolationPlugin);
MediaAssetSchema.index({ tenantId: 1, key: 1 }, { unique: true });
MediaAssetSchema.index({ tenantId: 1, folder: 1 });
export const MediaAssetModel = model<IMediaAsset>('MediaAsset', MediaAssetSchema);

// 4. CMS PAGES COLLECTION (Custom Static & Policy Pages)
export interface ICMSPage extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  title: string;
  slug: string;
  contentHtml: string;
  isPublished: boolean;
  seoMetaTitle?: string;
  seoMetaDescription?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const CMSPageSchema = new Schema<ICMSPage>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    contentHtml: { type: String, required: true },
    isPublished: { type: Boolean, default: true, index: true },
    seoMetaTitle: { type: String, trim: true },
    seoMetaDescription: { type: String, trim: true },
  },
  { timestamps: true, collection: 'cms_pages' }
);
CMSPageSchema.plugin(tenantIsolationPlugin);
CMSPageSchema.plugin(softDeletePlugin);
CMSPageSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
export const CMSPageModel = model<ICMSPage>('CMSPage', CMSPageSchema);

// 5. BLOG POSTS COLLECTION (Marketing & Content Publishing)
export interface IBlogPost extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  title: string;
  slug: string;
  excerpt?: string;
  contentHtml: string;
  authorUserId?: Types.ObjectId;
  coverImageUrl?: string;
  tags: string[];
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt?: Date;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const BlogPostSchema = new Schema<IBlogPost>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    excerpt: { type: String, trim: true },
    contentHtml: { type: String, required: true },
    authorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    coverImageUrl: { type: String, trim: true },
    tags: { type: [String], default: [] },
    status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], default: 'DRAFT', index: true },
    publishedAt: { type: Date },
  },
  { timestamps: true, collection: 'blog_posts' }
);
BlogPostSchema.plugin(tenantIsolationPlugin);
BlogPostSchema.plugin(softDeletePlugin);
BlogPostSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
BlogPostSchema.index({ tenantId: 1, status: 1, publishedAt: -1 });
export const BlogPostModel = model<IBlogPost>('BlogPost', BlogPostSchema);

// 6. NOTIFICATIONS COLLECTION (In-App, Email & SMS Logs)
export interface INotification extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  channel: 'EMAIL' | 'SMS' | 'IN_APP';
  recipient: string;
  subject?: string;
  content: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  errorMessage?: string;
  sentAt?: Date;
  createdAt: Date;
}

export const NotificationSchema = new Schema<INotification>(
  {
    channel: { type: String, required: true, enum: ['EMAIL', 'SMS', 'IN_APP'], index: true },
    recipient: { type: String, required: true, trim: true },
    subject: { type: String, trim: true },
    content: { type: String, required: true },
    status: { type: String, enum: ['PENDING', 'SENT', 'FAILED'], default: 'PENDING', index: true },
    errorMessage: { type: String },
    sentAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'notifications' }
);
NotificationSchema.plugin(tenantIsolationPlugin);
NotificationSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
export const NotificationModel = model<INotification>('Notification', NotificationSchema);

// 7. AUDIT LOGS COLLECTION (Immutable Security & Mutation Ledger)
export interface IAuditLog extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  actorUserId?: Types.ObjectId;
  action: string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  changesJson?: string;
  timestamp: Date;
}

export const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    action: { type: String, required: true, trim: true, index: true },
    resourceType: { type: String, required: true, trim: true, index: true },
    resourceId: { type: String, trim: true },
    ipAddress: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    changesJson: { type: String },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false, collection: 'audit_logs' }
);
AuditLogSchema.plugin(tenantIsolationPlugin);
AuditLogSchema.index({ tenantId: 1, timestamp: -1 });
export const AuditLogModel = model<IAuditLog>('AuditLog', AuditLogSchema);

// 8. WEBHOOK EVENTS COLLECTION (Idempotent Webhook Log)
export interface IWebhookEvent extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  gateway: string;
  eventType: string;
  payload: Record<string, unknown>;
  isProcessed: boolean;
  processedAt?: Date;
  errorMessage?: string;
  createdAt: Date;
}

export const WebhookEventSchema = new Schema<IWebhookEvent>(
  {
    gateway: { type: String, required: true, index: true },
    eventType: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    isProcessed: { type: Boolean, default: false, index: true },
    processedAt: { type: Date },
    errorMessage: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'webhook_events' }
);
WebhookEventSchema.plugin(tenantIsolationPlugin);
WebhookEventSchema.index({ tenantId: 1, gateway: 1, createdAt: -1 });
export const WebhookEventModel = model<IWebhookEvent>('WebhookEvent', WebhookEventSchema);
