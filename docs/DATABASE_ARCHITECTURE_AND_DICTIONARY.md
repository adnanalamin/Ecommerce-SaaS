# NEXORA Multi-Tenant SaaS Database Architecture & Data Dictionary
**Document ID:** NEXORA-ARCH-DB-004  
**Version:** 1.0.0  
**Status:** Approved & Implemented  
**Engine:** MongoDB 7.0+ Replica Set / Mongoose 8.x + TypeScript Strict Mode

---

## 1. Executive Summary & Architectural Tenets

NEXORA employs a hybrid multi-tenant database topology designed for high security, linear horizontal scale, and complete tenant data isolation. The platform avoids the fatal pitfalls of multi-tenant architectures by strictly enforcing isolation at the data tier and query builder level rather than relying on frontend or controller filtering.

### Core Tenets
1. **Zero-Trust Tenant Isolation**: Every tenant-owned document mandates an indexed `tenantId: ObjectId`. A global Mongoose query plugin intercepts all `find`, `findOne`, `countDocuments`, `update`, and `delete` operations, enforcing tenant boundary checks.
2. **Global vs. Tenant-Owned Segregation**: Exactly 4 collections are Global (platform-wide roots), while 31 collections are Tenant-Owned.
3. **Compound Tenant Indexing**: Every tenant collection enforces compound keys prefixed with `{ tenantId: 1, ... }`. This allows identical business slugs (e.g. `oversized-tee`) across multiple distinct tenant stores without collisions.
4. **Controlled Soft Deletion**: Entities representing business records (`Product`, `Category`, `Order`, `Customer`, `Store`) utilize soft deletion (`isDeleted`, `deletedAt`, `deletedBy`), while immutable ledgers (`Inventory`, `Payment`, `AuditLog`, `WebhookEvent`) are strictly append-only and never soft-deleted.
5. **ACID Multi-Document Transactions**: High-stakes transactional flows (checkout, inventory deduction, coupon redemption, and refund ledger updates) execute inside MongoDB Replica Set transactions with snapshot isolation.
6. **Enterprise Dedicated Database Support**: Enterprise tenants can optionally specify a dedicated MongoDB connection string (`dedicatedDbUri`), seamlessly routed through dynamic connection pooling.

---

## 2. Collection Classification Matrix

| # | Collection Name | Mongoose Model | Domain | Multi-Tenant Key | Soft Delete | Retention Policy |
|---|---|---|---|---|---|---|
| 1 | `users` | `UserModel` | GLOBAL | None (Platform) | Yes | Indefinite |
| 2 | `tenants` | `TenantModel` | GLOBAL | None (Platform) | Yes | Indefinite |
| 3 | `plans` | `PlanModel` | GLOBAL | None (Platform) | Yes | Indefinite |
| 4 | `system_settings` | `SystemSettingModel` | GLOBAL | None (Platform) | No | Permanent |
| 5 | `stores` | `StoreModel` | TENANT | `tenantId` | Yes | Indefinite |
| 6 | `permissions` | `PermissionModel` | TENANT | Global Enum Catalog | No | Permanent |
| 7 | `roles` | `RoleModel` | TENANT | `tenantId` | No | Indefinite |
| 8 | `store_memberships` | `StoreMembershipModel` | TENANT | `tenantId` | No | Revocation |
| 9 | `categories` | `CategoryModel` | TENANT | `tenantId` | Yes | Indefinite |
| 10 | `brands` | `BrandModel` | TENANT | `tenantId` | Yes | Indefinite |
| 11 | `product_attributes`| `ProductAttributeModel`| TENANT | `tenantId` | No | Indefinite |
| 12 | `products` | `ProductModel` | TENANT | `tenantId` | Yes | Indefinite |
| 13 | `product_variants` | `ProductVariantModel` | TENANT | `tenantId` | No | Parent cascade |
| 14 | `inventory` | `InventoryModel` | TENANT | `tenantId` | No (Ledger) | Permanent |
| 15 | `customers` | `CustomerModel` | TENANT | `tenantId` | Yes | Indefinite |
| 16 | `addresses` | `AddressModel` | TENANT | `tenantId` | No | Parent cascade |
| 17 | `carts` | `CartModel` | TENANT | `tenantId` | No | TTL 30 Days |
| 18 | `wishlists` | `WishlistModel` | TENANT | `tenantId` | No | Indefinite |
| 19 | `orders` | `OrderModel` | TENANT | `tenantId` | Yes | 7 Years (Financial) |
| 20 | `order_items` | `OrderItemModel` | TENANT | `tenantId` | No | 7 Years (Financial) |
| 21 | `payments` | `PaymentModel` | TENANT | `tenantId` | No (Ledger) | 7 Years (Fintech) |
| 22 | `refunds` | `RefundModel` | TENANT | `tenantId` | No (Ledger) | 7 Years (Fintech) |
| 23 | `shipping_methods` | `ShippingMethodModel` | TENANT | `tenantId` | No | Indefinite |
| 24 | `subscriptions` | `SubscriptionModel` | TENANT | `tenantId` | No | 7 Years (Billing) |
| 25 | `coupons` | `CouponModel` | TENANT | `tenantId` | No | 1 Year post-expiry |
| 26 | `reviews` | `ReviewModel` | TENANT | `tenantId` | No | Indefinite |
| 27 | `advertisements` | `AdvertisementModel` | TENANT | `tenantId` | No | 90 Days post-expiry|
| 28 | `themes` | `ThemeModel` | TENANT | `tenantId` | No | Indefinite |
| 29 | `branding_settings`| `BrandingSettingModel` | TENANT | `tenantId` | No | Indefinite |
| 30 | `media_assets` | `MediaAssetModel` | TENANT | `tenantId` | No | Indefinite |
| 31 | `cms_pages` | `CMSPageModel` | TENANT | `tenantId` | Yes | Indefinite |
| 32 | `blog_posts` | `BlogPostModel` | TENANT | `tenantId` | Yes | Indefinite |
| 33 | `notifications` | `NotificationModel` | TENANT | `tenantId` | No | 90 Days |
| 34 | `audit_logs` | `AuditLogModel` | TENANT | `tenantId` | No (Immutable) | 365 Days |
| 35 | `webhook_events` | `WebhookEventModel` | TENANT | `tenantId` | No | 30 Days |

---

## 3. Comprehensive Data Dictionary (All 35 Collections)

### 3.1 Global Domain

#### 1. `users`
Global identity repository for Platform Super Admins, Merchant Owners, Staff, and Shoppers.
- `_id`: ObjectId (PK)
- `email`: String (Required, Unique, Lowercase, Indexed)
- `passwordHash`: String (Argon2id Hash, Private/Hidden)
- `fullName`: String (Required, max 100)
- `phone`: String (Sparse Index, E.164 format)
- `userType`: Enum (`PLATFORM_SUPER_ADMIN` | `PLATFORM_ADMIN` | `MERCHANT` | `CUSTOMER`)
- `status`: Enum (`ACTIVE` | `PENDING_VERIFICATION` | `SUSPENDED`)
- `isMfaEnabled`: Boolean (Default false)
- `mfaSecretEncrypted`: String (Encrypted TOTP Secret, Hidden)
- `mfaBackupCodesHashed`: Array[String] (Hashed single-use codes)
- `avatarUrl`: String
- `lastLoginAt`: Date
- `isDeleted`: Boolean
- `deletedAt`: Date
- **Indexes:** `{ email: 1 }` (unique), `{ phone: 1 }` (sparse), `{ userType: 1 }`, `{ status: 1 }`.

#### 2. `tenants`
Organization master record for store builders and independent businesses.
- `_id`: ObjectId (PK)
- `name`: String (Required)
- `slug`: String (Required, Unique, Lowercase)
- `subdomain`: String (Required, Unique, e.g. `urbanwear` => `urbanwear.nexora.shop`)
- `customDomain`: String (Optional, e.g. `shop.urbanwearbd.com`, Indexed)
- `customDomainStatus`: Enum (`PENDING_VERIFICATION` | `ACTIVE` | `FAILED`)
- `ownerUserId`: ObjectId (FK -> `users._id`, Required, Indexed)
- `tier`: Enum (`STARTER` | `GROWTH` | `PRO` | `ENTERPRISE`)
- `status`: Enum (`TRIALING` | `ACTIVE` | `PAST_DUE` | `SUSPENDED` | `CANCELLED`)
- `dedicatedDbUri`: String (Optional, for Enterprise isolated databases)
- `settings`: Embedded Document (Currency, Timezone, Feature flags)
- `isDeleted`: Boolean
- **Indexes:** `{ subdomain: 1 }` (unique), `{ slug: 1 }` (unique), `{ customDomain: 1 }`, `{ ownerUserId: 1 }`, `{ tier: 1, status: 1 }`.

#### 3. `plans`
Platform subscription pricing, quotas, and feature entitlements.
- `_id`: ObjectId (PK)
- `name`: String
- `code`: Enum (`STARTER` | `GROWTH` | `PRO` | `ENTERPRISE`, Unique)
- `monthlyPrice`: Number (Required)
- `annualPrice`: Number (Required)
- `currency`: String (Default `BDT`)
- `features`: Array[String]
- `limits`: Object (`maxProducts`, `maxStaffAccounts`, `storageLimitMb`, `bandwidthLimitMb`, `customDomainAllowed`)
- `transactionFeePercentage`: Number
- `isActive`: Boolean
- **Indexes:** `{ code: 1 }` (unique), `{ isActive: 1 }`.

#### 4. `system_settings`
Platform-wide dynamic operational parameters.
- `_id`: ObjectId (PK)
- `key`: String (Unique, e.g. `PLATFORM_NAME`, `DEFAULT_STORAGE_QUOTA_MB`)
- `value`: Mixed
- `category`: Enum (`GENERAL` | `FINTECH` | `SECURITY` | `STORAGE` | `INTEGRATION`)
- `isPublic`: Boolean
- **Indexes:** `{ key: 1 }` (unique), `{ category: 1 }`.

---

### 3.2 Tenant Organizational Domain

#### 5. `stores`
Independent storefront instance owned by a tenant.
- `tenantId`: ObjectId (Required, Indexed)
- `name`: String (Required)
- `slug`: String (Required)
- `contactEmail`: String
- `contactPhone`: String
- `currency`: Enum (`BDT` | `USD` | `EUR` | `GBP`)
- `timezone`: String (Default `Asia/Dhaka`)
- `isMaintenanceMode`: Boolean
- **Compound Indexes:** `{ tenantId: 1, slug: 1 }` (unique).

#### 6. `permissions`
Global standard permission catalog.
- `code`: String (Unique, e.g. `PRODUCTS_CREATE`, `ORDERS_READ`)
- `module`: Enum (`PRODUCTS` | `ORDERS` | `CUSTOMERS` | `THEMES` | `FINTECH` | `SETTINGS` | `STAFF`)
- **Indexes:** `{ code: 1 }` (unique).

#### 7. `roles`
Custom roles created within a tenant.
- `tenantId`: ObjectId (Required)
- `code`: String (Required, e.g. `STORE_MANAGER`, `FULFILLMENT_STAFF`)
- `name`: String
- `permissions`: Array[String] (Array of permission codes)
- `isSystemDefault`: Boolean
- **Compound Indexes:** `{ tenantId: 1, code: 1 }` (unique).

#### 8. `store_memberships`
Association table linking users to tenant stores with assigned roles.
- `tenantId`: ObjectId (Required)
- `storeId`: ObjectId (FK -> `stores._id`)
- `userId`: ObjectId (FK -> `users._id`)
- `roleId`: ObjectId (FK -> `roles._id`)
- `customPermissions`: Array[String]
- `status`: Enum (`INVITED` | `ACTIVE` | `SUSPENDED`)
- **Compound Indexes:** `{ tenantId: 1, userId: 1, storeId: 1 }` (unique).

---

### 3.3 Tenant Catalog & Inventory Domain

#### 9. `categories`
Hierarchical product category taxonomy with nested tree support.
- `tenantId`: ObjectId (Required)
- `parentId`: ObjectId (Self-referencing FK, Optional)
- `name`: String
- `slug`: String
- `displayOrder`: Number
- `isVisible`: Boolean
- **Compound Indexes:** `{ tenantId: 1, slug: 1 }` (unique), `{ tenantId: 1, parentId: 1 }`.

#### 10. `brands`
Manufacturer and brand references.
- `tenantId`: ObjectId (Required)
- `name`: String
- `slug`: String
- `originCountry`: String
- **Compound Indexes:** `{ tenantId: 1, slug: 1 }` (unique).

#### 11. `product_attributes`
EAV specifications (Size, Color, Fabric, Weight).
- `tenantId`: ObjectId (Required)
- `code`: String (e.g. `COLOR`, `SIZE`)
- `values`: Array[String]
- **Compound Indexes:** `{ tenantId: 1, code: 1 }` (unique).

#### 12. `products`
Master product catalog contract.
- `tenantId`: ObjectId (Required)
- `title`: String (Required)
- `slug`: String (Required)
- `basePrice`: Number (Required, Min 0)
- `compareAtPrice`: Number (Optional, Original strike-through price)
- `costPrice`: Number (Private merchant COGS)
- `currency`: String (Default `BDT`)
- `status`: Enum (`DRAFT` | `PUBLISHED` | `ARCHIVED`)
- `isFeatured`: Boolean
- `hasVariants`: Boolean
- `primaryCategoryId`: ObjectId (FK -> `categories._id`)
- `brandId`: ObjectId (FK -> `brands._id`)
- `images`: Array of Image Objects (`url`, `altText`, `isPrimary`, `displayOrder`)
- `seo`: Embedded Object (`title`, `description`, `keywords`)
- `isDeleted`: Boolean
- **Compound Indexes:** `{ tenantId: 1, slug: 1 }` (unique), `{ tenantId: 1, status: 1, isFeatured: 1 }`, Text search on `{ title: 'text', description: 'text' }`.

#### 13. `product_variants`
SKU-level variant instances with distinct attributes and barcodes.
- `tenantId`: ObjectId (Required)
- `productId`: ObjectId (FK -> `products._id`, Required)
- `sku`: String (Required, Unique per tenant)
- `barcode`: String (UPC/EAN)
- `price`: Number (Required)
- `options`: Array of Key-Value Objects (`name: 'Size'`, `value: 'XL'`)
- `weightGrams`: Number
- **Compound Indexes:** `{ tenantId: 1, sku: 1 }` (unique), `{ tenantId: 1, productId: 1 }`.

#### 14. `inventory`
Real-time stock ledger tracking availability, reservations, and backorders.
- `tenantId`: ObjectId (Required)
- `variantId`: ObjectId (FK -> `product_variants._id`, Required)
- `locationId`: String (Warehouse / Outlet identifier)
- `quantityAvailable`: Number (Available for immediate purchase)
- `quantityReserved`: Number (In unfulfilled or pending checkout orders)
- `lowStockThreshold`: Number
- `isTracked`: Boolean
- **Compound Indexes:** `{ tenantId: 1, variantId: 1, locationId: 1 }` (unique).

---

### 3.4 Tenant Customers, Carts & Wishlists

#### 15. `customers`
Storefront shoppers with loyalty metrics and lifetime order tallies.
- `tenantId`: ObjectId (Required)
- `userId`: ObjectId (FK -> `users._id`, Optional for guest accounts)
- `email`: String (Required, Lowercase)
- `phone`: String
- `firstName`: String
- `lastName`: String
- `totalOrders`: Number (Default 0)
- `totalSpent`: Number (Default 0)
- `lastOrderAt`: Date
- **Compound Indexes:** `{ tenantId: 1, email: 1 }` (unique), `{ tenantId: 1, phone: 1 }`, `{ tenantId: 1, totalSpent: -1 }`.

#### 16. `addresses`
Delivery destinations supporting Bangladesh Divisions, Districts, and Upazilas.
- `tenantId`: ObjectId (Required)
- `customerId`: ObjectId (FK -> `customers._id`, Required)
- `division`: String (e.g. `Dhaka`, `Chattogram`, `Sylhet`)
- `district`: String (e.g. `Gazipur`, `Cumilla`)
- `thana`: String
- `streetAddress`: String
- `postalCode`: String
- `isDefaultShipping`: Boolean
- **Compound Indexes:** `{ tenantId: 1, customerId: 1 }`.

#### 17. `carts`
Active shopper session carts with automated 30-day MongoDB TTL expiration.
- `tenantId`: ObjectId (Required)
- `customerId`: ObjectId (Optional)
- `sessionId`: String (Indexed)
- `items`: Array of Line Items (`variantId`, `quantity`, `unitPrice`)
- `appliedCouponCode`: String
- `expiresAt`: Date (MongoDB TTL index: automatically deletes expired abandoned carts)
- **Compound Indexes:** `{ tenantId: 1, sessionId: 1 }`, `{ tenantId: 1, customerId: 1 }`, TTL on `{ expiresAt: 1 }`.

#### 18. `wishlists`
Customer saved items registry.
- `tenantId`: ObjectId (Required)
- `customerId`: ObjectId (FK -> `customers._id`, Required)
- `productId`: ObjectId (FK -> `products._id`, Required)
- **Compound Indexes:** `{ tenantId: 1, customerId: 1, productId: 1 }` (unique).

---

### 3.5 Tenant Orders, Payments & Logistics

#### 19. `orders`
Transactional sales contract with audit sums.
- `tenantId`: ObjectId (Required)
- `orderNumber`: String (e.g. `ORD-202611-00891`)
- `customerId`: ObjectId (FK -> `customers._id`)
- `subtotal`: Number
- `discountTotal`: Number
- `shippingFee`: Number
- `taxTotal`: Number
- `grandTotal`: Number
- `currency`: String (`BDT`)
- `status`: Enum (`PENDING` | `CONFIRMED` | `PROCESSING` | `SHIPPED` | `DELIVERED` | `CANCELLED` | `RETURNED`)
- `paymentStatus`: Enum (`PENDING` | `AUTHORIZED` | `PAID` | `PARTIALLY_REFUNDED` | `REFUNDED` | `FAILED`)
- `shippingAddress`: Embedded Address Snapshot
- `billingAddress`: Embedded Address Snapshot
- `shippingMethodId`: ObjectId
- **Compound Indexes:** `{ tenantId: 1, orderNumber: 1 }` (unique), `{ tenantId: 1, customerId: 1 }`, `{ tenantId: 1, status: 1, paymentStatus: 1 }`.

#### 20. `order_items`
Immutable historical record of purchased items at point-in-time pricing.
- `tenantId`: ObjectId (Required)
- `orderId`: ObjectId (FK -> `orders._id`, Required)
- `productId`: ObjectId (FK -> `products._id`)
- `variantId`: ObjectId (FK -> `product_variants._id`)
- `title`: String
- `sku`: String
- `unitPrice`: Number
- `quantity`: Number
- `totalPrice`: Number
- **Compound Indexes:** `{ tenantId: 1, orderId: 1 }`.

#### 21. `payments`
Fintech payment transaction ledger for Bangladesh and Global Gateways.
- `tenantId`: ObjectId (Required)
- `orderId`: ObjectId (FK -> `orders._id`, Required)
- `transactionId`: String (Gateway reference e.g. bKash TrxID, Stripe ch_xxx, SSLCommerz TranID)
- `provider`: Enum (`BKASH` | `NAGAD` | `ROCKET` | `SSLCOMMERZ` | `STRIPE` | `COD`)
- `amount`: Number
- `currency`: String (`BDT`, `USD`)
- `status`: Enum (`INITIATED` | `PENDING` | `SUCCESS` | `FAILED` | `REFUNDED`)
- `rawGatewayResponse`: Mixed (Hidden for security audit)
- **Compound Indexes:** `{ tenantId: 1, transactionId: 1 }` (unique), `{ tenantId: 1, orderId: 1 }`.

#### 22. `refunds`
Reversal and merchandise return ledger.
- `tenantId`: ObjectId (Required)
- `orderId`: ObjectId (FK -> `orders._id`)
- `paymentId`: ObjectId (FK -> `payments._id`)
- `amount`: Number
- `reason`: String
- `status`: Enum (`REQUESTED` | `APPROVED` | `PROCESSED` | `REJECTED`)
- **Compound Indexes:** `{ tenantId: 1, paymentId: 1 }`.

#### 23. `shipping_methods`
Zone-based courier rate definitions.
- `tenantId`: ObjectId (Required)
- `name`: String (e.g. `Standard Home Delivery`)
- `code`: String (e.g. `STD_INSIDE_DHAKA`)
- `baseRate`: Number (e.g. `70` BDT)
- `freeShippingThreshold`: Number (e.g. `2500` BDT)
- `zone`: Enum (`INSIDE_DHAKA` | `OUTSIDE_DHAKA` | `NATIONWIDE` | `INTERNATIONAL`)
- `estimatedDeliveryDaysMin`: Number
- `estimatedDeliveryDaysMax`: Number
- `isEnabled`: Boolean
- **Compound Indexes:** `{ tenantId: 1, code: 1 }` (unique).

---

### 3.6 Marketing, Monetization & Reviews

#### 24. `subscriptions`
Tenant SaaS recurring billing contracts with invoice intervals.
- `tenantId`: ObjectId (Required)
- `planId`: ObjectId (FK -> `plans._id`, Required)
- `billingInterval`: Enum (`MONTHLY` | `ANNUALLY`)
- `currentPeriodStart`: Date
- `currentPeriodEnd`: Date
- `status`: Enum (`ACTIVE` | `PAST_DUE` | `CANCELED` | `INCOMPLETE`)
- `cancelAtPeriodEnd`: Boolean
- **Compound Indexes:** `{ tenantId: 1, status: 1 }`.

#### 25. `coupons`
Promotional discount campaigns.
- `tenantId`: ObjectId (Required)
- `code`: String (Uppercase, e.g. `EID500`, `WINTER20`)
- `discountType`: Enum (`PERCENTAGE` | `FIXED_AMOUNT` | `FREE_SHIPPING`)
- `value`: Number
- `minOrderValue`: Number
- `maxDiscountCap`: Number
- `usageLimitTotal`: Number
- `usageCount`: Number (Default 0)
- `startsAt`: Date
- `expiresAt`: Date
- **Compound Indexes:** `{ tenantId: 1, code: 1 }` (unique).

#### 26. `reviews`
Storefront customer ratings and moderation workflow.
- `tenantId`: ObjectId (Required)
- `productId`: ObjectId (FK -> `products._id`)
- `customerId`: ObjectId (FK -> `customers._id`)
- `rating`: Number (1 to 5)
- `comment`: String
- `isVerifiedPurchase`: Boolean
- `isApproved`: Boolean (Default false)
- **Compound Indexes:** `{ tenantId: 1, productId: 1, isApproved: 1 }`.

#### 27. `advertisements`
Storefront promotional banners and Google AdSense units.
- `tenantId`: ObjectId (Required)
- `title`: String
- `placement`: Enum (`HEADER_BANNER` | `HOME_SLIDER` | `SIDEBAR` | `FOOTER` | `BETWEEN_PRODUCTS`)
- `adType`: Enum (`CUSTOM_BANNER` | `GOOGLE_ADSENSE`)
- `imageUrl`: String
- `targetUrl`: String
- `adSenseSlotId`: String
- `status`: Enum (`ACTIVE` | `PAUSED` | `EXPIRED`)
- `startsAt`: Date
- `expiresAt`: Date
- **Compound Indexes:** `{ tenantId: 1, placement: 1, status: 1 }`.

---

### 3.7 Content, Branding, Audit & Webhooks

#### 28. `themes`
Storefront templates and layout tokens.
- `tenantId`: ObjectId (Required)
- `code`: String (Unique per tenant)
- `name`: String
- `config`: Object (Typography, header layout, color schemes)
- `isPublished`: Boolean
- **Compound Indexes:** `{ tenantId: 1, code: 1 }` (unique).

#### 29. `branding_settings`
Merchant identity, logos, and custom styling overrides.
- `tenantId`: ObjectId (Required, Unique 1-to-1)
- `brandName`: String
- `logoUrl`: String
- `faviconUrl`: String
- `primaryColor`: String
- `secondaryColor`: String
- `customCss`: String
- **Compound Indexes:** `{ tenantId: 1 }` (unique).

#### 30. `media_assets`
Cloud storage CDN asset catalog.
- `tenantId`: ObjectId (Required)
- `fileKey`: String (S3/Cloudinary asset key, Unique per tenant)
- `url`: String
- `mimeType`: String
- `sizeBytes`: Number
- `width`: Number
- `height`: Number
- **Compound Indexes:** `{ tenantId: 1, fileKey: 1 }` (unique).

#### 31. `cms_pages`
Custom informational content pages.
- `tenantId`: ObjectId (Required)
- `title`: String
- `slug`: String (e.g. `about-us`, `privacy-policy`, `terms`)
- `bodyHtml`: String
- `isPublished`: Boolean
- `seo`: Embedded Object
- **Compound Indexes:** `{ tenantId: 1, slug: 1 }` (unique).

#### 32. `blog_posts`
Merchant blogging and SEO articles.
- `tenantId`: ObjectId (Required)
- `title`: String
- `slug`: String
- `contentHtml`: String
- `excerpt`: String
- `coverImageUrl`: String
- `author`: String
- `tags`: Array[String]
- `isPublished`: Boolean
- **Compound Indexes:** `{ tenantId: 1, slug: 1 }` (unique).

#### 33. `notifications`
Real-time merchant alerts.
- `tenantId`: ObjectId (Required)
- `recipientId`: ObjectId (FK -> `users._id`)
- `title`: String
- `message`: String
- `type`: Enum (`ORDER_PLACED` | `LOW_STOCK` | `PAYMENT_RECEIVED` | `SYSTEM`)
- `isRead`: Boolean (Default false)
- **Compound Indexes:** `{ tenantId: 1, recipientId: 1, isRead: 1 }`.

#### 34. `audit_logs`
Immutable compliance and security trails.
- `tenantId`: ObjectId (Required)
- `actorUserId`: ObjectId (FK -> `users._id`)
- `action`: String (e.g. `PRODUCT_DELETED`, `ORDER_REFUNDED`, `ROLE_UPDATED`)
- `entity`: String
- `entityId`: String
- `ipAddress`: String
- `userAgent`: String
- `diff`: Object (`before`, `after`)
- **Compound Indexes:** `{ tenantId: 1, entity: 1, entityId: 1 }`, `{ tenantId: 1, actorUserId: 1 }`, `{ tenantId: 1, createdAt: -1 }`.

#### 35. `webhook_events`
Outbound event delivery broker queue.
- `tenantId`: ObjectId (Required)
- `eventId`: String (UUID v4)
- `eventType`: Enum (`ORDER_CREATED` | `PAYMENT_CAPTURED` | `INVENTORY_DEPLETED` | `CUSTOMER_CREATED`)
- `targetUrl`: String
- `payload`: Mixed
- `status`: Enum (`PENDING` | `DELIVERED` | `FAILED`)
- `attempts`: Number
- `nextRetryAt`: Date
- **Compound Indexes:** `{ tenantId: 1, eventId: 1 }` (unique), `{ tenantId: 1, status: 1, nextRetryAt: 1 }`.

---

## 4. ACID Transaction Requirements & Blueprints

Certain multi-step operations require strict ACID atomicity to prevent stock overselling, double billing, or orphaned ledger entries. MongoDB Replica Set sessions with `startTransaction()` provide snapshot isolation.

### 4.1 Order Placement & Inventory Reservation Transaction
```typescript
import mongoose from 'mongoose';
import { OrderModel, OrderItemModel, InventoryModel, CartModel } from './models';

export async function executeOrderCheckoutTransaction(params: {
  tenantId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  cartId: mongoose.Types.ObjectId;
  shippingAddress: any;
  items: Array<{ variantId: string; quantity: number; unitPrice: number; title: string; sku: string }>;
}) {
  const session = await mongoose.startSession();
  session.startTransaction({
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
  });

  try {
    // Step 1: Atomically verify and decrement available inventory
    for (const item of params.items) {
      const inventoryDoc = await InventoryModel.findOneAndUpdate(
        {
          tenantId: params.tenantId,
          variantId: item.variantId,
          quantityAvailable: { $gte: item.quantity }, // Prevents race condition / negative stock
        },
        {
          $inc: {
            quantityAvailable: -item.quantity,
            quantityReserved: item.quantity,
          },
        },
        { session, new: true }
      );

      if (!inventoryDoc) {
        throw new Error(`Insufficient stock available for SKU ${item.sku}`);
      }
    }

    // Step 2: Create Order Master record
    const grandTotal = params.items.reduce((acc, cur) => acc + cur.quantity * cur.unitPrice, 0);
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const [order] = await OrderModel.create(
      [
        {
          tenantId: params.tenantId,
          orderNumber,
          customerId: params.customerId,
          grandTotal,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          shippingAddress: params.shippingAddress,
        },
      ],
      { session }
    );

    // Step 3: Insert line items
    const lineItems = params.items.map((it) => ({
      tenantId: params.tenantId,
      orderId: order._id,
      variantId: it.variantId,
      title: it.title,
      sku: it.sku,
      unitPrice: it.unitPrice,
      quantity: it.quantity,
      totalPrice: it.quantity * it.unitPrice,
    }));
    await OrderItemModel.insertMany(lineItems, { session });

    // Step 4: Clear active cart
    await CartModel.findByIdAndDelete(params.cartId, { session });

    // Step 5: Commit transaction
    await session.commitTransaction();
    return order;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
```

---

## 5. Enterprise Dedicated Database Routing Strategy

While standard Starter, Growth, and Pro tenants share the multi-tenant cluster with indexed isolation, Enterprise tenants can opt into dedicated MongoDB Replica Sets for regulatory compliance, physical data residency, and dedicated throughput.

### Connection Resolver Pattern
1. When a request arrives, `tenantResolutionMiddleware` queries the Redis tenant cache (fallback to Global `TenantModel`).
2. If `tenant.tier === 'ENTERPRISE'` and `tenant.dedicatedDbUri` is populated:
   - The connection pool manager retrieves the tenant's dedicated Mongoose connection instance from an LRU connection cache (`Map<string, Connection>`).
   - If no connection exists, it initializes a dedicated connection with custom pool parameters (`minPoolSize: 5`, `maxPoolSize: 50`).
3. If no `dedicatedDbUri` exists, the request defaults to the shared multi-tenant cluster connection.
4. Tenant isolation plugin checks remain active on both clusters as defense-in-depth against configuration drift.

---

## 6. Data Retention & Archival Policies

1. **Active Shopping Carts**: Expire after 30 days of inactivity using MongoDB native TTL index (`{ expiresAt: 1 }`).
2. **Audit Logs**: Retained for 365 days. Records older than 1 year are streamed to compressed cold storage (S3 Glacier / Google Cloud Storage Archive).
3. **Webhook Events**: Retained for 30 days after terminal status (`DELIVERED` or `FAILED`).
4. **Financial Ledgers (Orders, Payments, Refunds)**: Retained for a minimum of 7 years in compliance with national financial and tax accounting regulations. Soft deletion is restricted to administrative cancellation, with full audit trail preserved.

---

## 7. Migration & Seeding Strategy

- **Seeding Execution**: Run `npm run seed` or `POST /api/v1/database/seed`.
- **Pre-flight Assertions**: The test suite `runDatabaseVerificationSuite()` executes automatically before major releases to guarantee zero schema regression across all 35 models.
