/**
 * NEXORA Database Architecture - Central Model Registry
 * Exports all 35 Mongoose models and their TypeScript interfaces.
 * 
 * Domains:
 * - GLOBAL: Users, Tenants, Plans, SystemSettings
 * - TENANT: Stores, StoreMemberships, Roles, Permissions, Catalog, Customers,
 *           Orders, Marketing, CMS, Branding, Media, Audit Logs, Webhooks
 */

// 1. GLOBAL MODELS & INTERFACES
export {
  UserModel,
  UserSchema,
  type IUser,
  type UserType,
  type UserStatus,
} from './schemas/global/users.ts';

export {
  AuthSessionModel,
  AuthSessionSchema,
  type IAuthSession,
  AuthTokenModel,
  AuthTokenSchema,
  type IAuthToken,
  type AuthTokenType,
  LoginHistoryModel,
  LoginHistorySchema,
  type ILoginHistory,
  type LoginHistoryStatus,
  type SuspiciousSignal,
} from './schemas/global/auth.ts';

export {
  TenantModel,
  TenantSchema,
  type ITenant,
  type TenantStatus,
  type TenantTier,
} from './schemas/global/tenants.ts';

export {
  PlanModel,
  PlanSchema,
  type IPlan,
  type PlanCode,
} from './schemas/global/plans.ts';

export {
  SystemSettingModel,
  SystemSettingSchema,
  type ISystemSetting,
} from './schemas/global/systemSettings.ts';

export {
  StaffInvitationModel,
  StaffInvitationSchema,
  type IStaffInvitation,
  AdminActivityLogModel,
  AdminActivityLogSchema,
  type IAdminActivityLog,
  type AdminActivityAction,
} from './schemas/global/rbac.ts';

// 2. TENANT ORGANIZATIONAL MODELS
export {
  StoreModel,
  StoreSchema,
  type IStore,
  PermissionModel,
  PermissionSchema,
  type IPermission,
  type PermissionModule,
  RoleModel,
  RoleSchema,
  type IRole,
  StoreMembershipModel,
  StoreMembershipSchema,
  type IStoreMembership,
} from './schemas/tenant/stores.ts';

// 3. CATALOG MODELS
export {
  CategoryModel,
  CategorySchema,
  type ICategory,
  BrandModel,
  BrandSchema,
  type IBrand,
  ProductAttributeModel,
  ProductAttributeSchema,
  type IProductAttribute,
  ProductModel,
  ProductSchema,
  type IProduct,
  ProductVariantModel,
  ProductVariantSchema,
  type IProductVariant,
  InventoryModel,
  InventorySchema,
  type IInventory,
} from './schemas/tenant/catalog.ts';

// 4. CUSTOMERS & COMMERCE PRE-PURCHASE MODELS
export {
  CustomerModel,
  CustomerSchema,
  type ICustomer,
  AddressModel,
  AddressSchema,
  type IAddress,
  CartModel,
  CartSchema,
  type ICart,
  WishlistModel,
  WishlistSchema,
  type IWishlist,
} from './schemas/tenant/customers.ts';

// 5. ORDERS, PAYMENTS & LOGISTICS MODELS
export {
  OrderModel,
  OrderSchema,
  type IOrder,
  OrderItemModel,
  OrderItemSchema,
  type IOrderItem,
  PaymentModel,
  PaymentSchema,
  type IPayment,
  RefundModel,
  RefundSchema,
  type IRefund,
  ShippingMethodModel,
  ShippingMethodSchema,
  type IShippingMethod,
} from './schemas/tenant/orders.ts';

// 6. MARKETING, REVIEWS & MONETIZATION MODELS
export {
  SubscriptionModel,
  SubscriptionSchema,
  type ISubscription,
  CouponModel,
  CouponSchema,
  type ICoupon,
  ReviewModel,
  ReviewSchema,
  type IReview,
  AdvertisementModel,
  AdvertisementSchema,
  type IAdvertisement,
} from './schemas/tenant/marketing.ts';

// 7. CONTENT, BRANDING, AUDIT & WEBHOOKS
export {
  ThemeModel,
  ThemeSchema,
  type ITheme,
  BrandingSettingModel,
  BrandingSettingSchema,
  type IBrandingSetting,
  MediaAssetModel,
  MediaAssetSchema,
  type IMediaAsset,
  CMSPageModel,
  CMSPageSchema,
  type ICMSPage,
  BlogPostModel,
  BlogPostSchema,
  type IBlogPost,
  NotificationModel,
  NotificationSchema,
  type INotification,
  AuditLogModel,
  AuditLogSchema,
  type IAuditLog,
  WebhookEventModel,
  WebhookEventSchema,
  type IWebhookEvent,
} from './schemas/tenant/contentAndAudit.ts';

// METADATA REGISTRY: List of all 35 Collections with Domain & Characteristics
export interface CollectionMetadata {
  collectionName: string;
  modelName: string;
  domain: 'GLOBAL' | 'TENANT';
  hasSoftDelete: boolean;
  hasTenantIsolation: boolean;
  primaryIndexes: string[];
  description: string;
}

export const NEXORA_COLLECTION_REGISTRY: CollectionMetadata[] = [
  // Global Domain (4)
  {
    collectionName: 'users',
    modelName: 'User',
    domain: 'GLOBAL',
    hasSoftDelete: true,
    hasTenantIsolation: false,
    primaryIndexes: ['email (unique)', 'phone', 'userType', 'status'],
    description: 'Global identity catalog for platform admins, merchants, and cross-platform users.',
  },
  {
    collectionName: 'tenants',
    modelName: 'Tenant',
    domain: 'GLOBAL',
    hasSoftDelete: true,
    hasTenantIsolation: false,
    primaryIndexes: ['subdomain (unique)', 'slug (unique)', 'customDomain', 'ownerUserId', 'tier', 'status'],
    description: 'Tenant organization root managing plan subscriptions, domain mapping, and dedicated DB configs.',
  },
  {
    collectionName: 'plans',
    modelName: 'Plan',
    domain: 'GLOBAL',
    hasSoftDelete: true,
    hasTenantIsolation: false,
    primaryIndexes: ['code (unique)', 'isActive', 'tier'],
    description: 'Platform billing plans defining storage quotas, transaction fees, and staff limits.',
  },
  {
    collectionName: 'system_settings',
    modelName: 'SystemSetting',
    domain: 'GLOBAL',
    hasSoftDelete: false,
    hasTenantIsolation: false,
    primaryIndexes: ['key (unique)', 'category'],
    description: 'Platform-level configurations such as gateway API credentials, maintenance locks, and rate limits.',
  },

  // Tenant Organizational (4)
  {
    collectionName: 'stores',
    modelName: 'Store',
    domain: 'TENANT',
    hasSoftDelete: true,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + slug (unique)'],
    description: 'Independent storefront instance with distinct currency, timezone, and branding.',
  },
  {
    collectionName: 'permissions',
    modelName: 'Permission',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: false,
    primaryIndexes: ['code (unique)', 'module'],
    description: 'Standard granular permissions dictionary for RBAC access control.',
  },
  {
    collectionName: 'roles',
    modelName: 'Role',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + code (unique)'],
    description: 'Tenant-specific custom roles aggregating permission codes for team members.',
  },
  {
    collectionName: 'store_memberships',
    modelName: 'StoreMembership',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + userId + storeId (unique)', 'tenantId + status'],
    description: 'Multi-tenant team membership mapping users to store roles and permissions.',
  },

  // Tenant Catalog (6)
  {
    collectionName: 'categories',
    modelName: 'Category',
    domain: 'TENANT',
    hasSoftDelete: true,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + slug (unique)', 'tenantId + parentId', 'tenantId + isVisible'],
    description: 'Hierarchical product category taxonomy with nested tree structures.',
  },
  {
    collectionName: 'brands',
    modelName: 'Brand',
    domain: 'TENANT',
    hasSoftDelete: true,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + slug (unique)'],
    description: 'Product brand manufacturers and vendor identifiers within tenant storefront.',
  },
  {
    collectionName: 'product_attributes',
    modelName: 'ProductAttribute',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + code (unique)'],
    description: 'EAV attribute dictionary defining custom variant options (Size, Color, Material).',
  },
  {
    collectionName: 'products',
    modelName: 'Product',
    domain: 'TENANT',
    hasSoftDelete: true,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + slug (unique)', 'tenantId + status + isFeatured', 'title + description (text)'],
    description: 'Core product catalog entity storing pricing, SEO, inventory policy, and tax rules.',
  },
  {
    collectionName: 'product_variants',
    modelName: 'ProductVariant',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + sku (unique)', 'tenantId + productId'],
    description: 'SKU-level variant instances with distinct barcodes, prices, and attribute matrices.',
  },
  {
    collectionName: 'inventory',
    modelName: 'Inventory',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + variantId + locationId (unique)'],
    description: 'Stock tracking ledger with reserved allocations, committed orders, and safety thresholds.',
  },

  // Tenant Customers & Pre-Purchase (4)
  {
    collectionName: 'customers',
    modelName: 'Customer',
    domain: 'TENANT',
    hasSoftDelete: true,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + email (unique)', 'tenantId + phone', 'tenantId + totalOrders'],
    description: 'Storefront customer profiles with lifetime spend, orders count, and loyalty tiers.',
  },
  {
    collectionName: 'addresses',
    modelName: 'Address',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + customerId', 'tenantId + customerId + isDefaultShipping'],
    description: 'Customer delivery addresses with Bangladesh division/district/upazila support.',
  },
  {
    collectionName: 'carts',
    modelName: 'Cart',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + customerId', 'tenantId + sessionId', 'expiresAt (TTL 30d)'],
    description: 'Active shopping session state with auto-expiring 30-day MongoDB TTL index.',
  },
  {
    collectionName: 'wishlists',
    modelName: 'Wishlist',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + customerId + productId (unique)'],
    description: 'Customer saved items and favorite product registries.',
  },

  // Tenant Orders, Payments & Logistics (5)
  {
    collectionName: 'orders',
    modelName: 'Order',
    domain: 'TENANT',
    hasSoftDelete: true,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + orderNumber (unique)', 'tenantId + customerId', 'tenantId + status + paymentStatus'],
    description: 'Central transactional order contract recording financial sums, tax, and fulfillment status.',
  },
  {
    collectionName: 'order_items',
    modelName: 'OrderItem',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + orderId', 'tenantId + productId'],
    description: 'Immutable historical snapshots of purchased line items and pricing at time of sale.',
  },
  {
    collectionName: 'payments',
    modelName: 'Payment',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + transactionId (unique)', 'tenantId + orderId', 'tenantId + status'],
    description: 'Fintech transaction logs with bKash, Nagad, SSLCommerz, Stripe, and COD idempotency.',
  },
  {
    collectionName: 'refunds',
    modelName: 'Refund',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + paymentId', 'tenantId + orderId'],
    description: 'Disbursement audit records for returned merchandise and payment reversals.',
  },
  {
    collectionName: 'shipping_methods',
    modelName: 'ShippingMethod',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + code (unique)', 'tenantId + isEnabled'],
    description: 'Courier options, zone fee rules (Inside Dhaka, Outside Dhaka), and delivery estimates.',
  },

  // Tenant Marketing, Monetization & Reviews (4)
  {
    collectionName: 'subscriptions',
    modelName: 'Subscription',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + status', 'tenantId + currentPeriodEnd'],
    description: 'Tenant billing lifecycle tracking recurring SaaS plan fees, renewals, and invoice history.',
  },
  {
    collectionName: 'coupons',
    modelName: 'Coupon',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + code (unique)', 'tenantId + startsAt + expiresAt'],
    description: 'Promotional discount campaigns supporting percentage, fixed sum, and free shipping.',
  },
  {
    collectionName: 'reviews',
    modelName: 'Review',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + productId + isApproved', 'tenantId + customerId'],
    description: 'Customer product ratings, media feedback, and moderation workflow.',
  },
  {
    collectionName: 'advertisements',
    modelName: 'Advertisement',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + placement + status', 'tenantId + startsAt + expiresAt'],
    description: 'Storefront promotional banners, Google AdSense integrations, and impression tracking.',
  },

  // Tenant Content, Themes, Audit & Webhooks (8)
  {
    collectionName: 'themes',
    modelName: 'Theme',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + code (unique)', 'tenantId + isPublished'],
    description: 'Storefront template configuration, typography tokens, and layout schemas.',
  },
  {
    collectionName: 'branding_settings',
    modelName: 'BrandingSetting',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId (unique)'],
    description: 'Brand identity assets, logos, favicon, custom CSS, and brand color palette.',
  },
  {
    collectionName: 'media_assets',
    modelName: 'MediaAsset',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + fileKey (unique)', 'tenantId + mimeType'],
    description: 'Cloud storage CDN asset catalog with responsive image dimensions and blur hashes.',
  },
  {
    collectionName: 'cms_pages',
    modelName: 'CMSPage',
    domain: 'TENANT',
    hasSoftDelete: true,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + slug (unique)', 'tenantId + isPublished'],
    description: 'Custom informational content pages (About Us, Terms, Privacy, FAQ).',
  },
  {
    collectionName: 'blog_posts',
    modelName: 'BlogPost',
    domain: 'TENANT',
    hasSoftDelete: true,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + slug (unique)', 'tenantId + isPublished'],
    description: 'Content marketing blog entries with tags, author details, and SEO metadata.',
  },
  {
    collectionName: 'notifications',
    modelName: 'Notification',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + recipientId + isRead', 'tenantId + createdAt'],
    description: 'In-app real-time alerts for orders, inventory restocking, and customer activities.',
  },
  {
    collectionName: 'audit_logs',
    modelName: 'AuditLog',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + entity + entityId', 'tenantId + actorUserId', 'tenantId + createdAt'],
    description: 'Immutable security ledger recording every mutation, actor IP, and delta changes.',
  },
  {
    collectionName: 'webhook_events',
    modelName: 'WebhookEvent',
    domain: 'TENANT',
    hasSoftDelete: false,
    hasTenantIsolation: true,
    primaryIndexes: ['tenantId + eventId (unique)', 'tenantId + status + nextRetryAt'],
    description: 'Outbound webhook dispatcher queue tracking deliveries, payloads, and HMAC signatures.',
  },
];
