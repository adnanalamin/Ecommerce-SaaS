/**
 * NEXORA Database Architecture
 * Customers, Addresses, Carts & Wishlists Schemas
 */

import { Schema, model, Document, Types } from 'mongoose';
import { tenantIsolationPlugin } from '../../plugins/tenantIsolation.ts';
import { softDeletePlugin } from '../../plugins/softDelete.ts';

// 1. CUSTOMERS COLLECTION (Shopper Directory per Tenant)
export interface ICustomer extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  userId?: Types.ObjectId; // Nullable for guest checkout records
  email: string;
  phone?: string;
  fullName: string;
  totalOrdersCount: number;
  totalSpendBDT: number;
  tags: string[];
  notes?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const CustomerSchema = new Schema<ICustomer>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', sparse: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    fullName: { type: String, required: true, trim: true },
    totalOrdersCount: { type: Number, default: 0, min: 0 },
    totalSpendBDT: { type: Number, default: 0, min: 0 },
    tags: { type: [String], default: [] },
    notes: { type: String, trim: true },
  },
  { timestamps: true, collection: 'customers' }
);
CustomerSchema.plugin(tenantIsolationPlugin);
CustomerSchema.plugin(softDeletePlugin);
CustomerSchema.index({ tenantId: 1, email: 1 }, { unique: true });
CustomerSchema.index({ tenantId: 1, phone: 1 });
export const CustomerModel = model<ICustomer>('Customer', CustomerSchema);

// 2. ADDRESSES COLLECTION (Customer Shipping/Billing Addresses)
export interface IAddress extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  customerId: Types.ObjectId;
  recipientName: string;
  phone: string;
  addressType: 'SHIPPING' | 'BILLING' | 'BOTH';
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateOrDivision: string; // e.g. Dhaka, Chittagong, Sylhet
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const AddressSchema = new Schema<IAddress>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    recipientName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    addressType: { type: String, enum: ['SHIPPING', 'BILLING', 'BOTH'], default: 'SHIPPING' },
    addressLine1: { type: String, required: true, trim: true },
    addressLine2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    stateOrDivision: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, required: true, default: 'Bangladesh' },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'addresses' }
);
AddressSchema.plugin(tenantIsolationPlugin);
AddressSchema.index({ tenantId: 1, customerId: 1, isDefault: 1 });
export const AddressModel = model<IAddress>('Address', AddressSchema);

// 3. CARTS COLLECTION (Shopping Cart with TTL Auto-Expiry)
export interface ICartItem {
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  quantity: number;
  unitPrice: number;
  addedAt: Date;
}

export interface ICart extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  customerId?: Types.ObjectId;
  guestSessionId?: string;
  items: ICartItem[];
  couponCode?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const CartSchema = new Schema<ICart>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', sparse: true, index: true },
    guestSessionId: { type: String, sparse: true, index: true },
    items: [
      {
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    couponCode: { type: String, trim: true, uppercase: true },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30-day TTL
      index: { expires: 0 }, // TTL index auto-deletes expired guest carts
    },
  },
  { timestamps: true, collection: 'carts' }
);
CartSchema.plugin(tenantIsolationPlugin);
CartSchema.index({ tenantId: 1, customerId: 1 }, { sparse: true });
CartSchema.index({ tenantId: 1, guestSessionId: 1 }, { sparse: true });
export const CartModel = model<ICart>('Cart', CartSchema);

// 4. WISHLISTS COLLECTION (Saved Products)
export interface IWishlist extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  customerId: Types.ObjectId;
  productIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export const WishlistSchema = new Schema<IWishlist>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    productIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  },
  { timestamps: true, collection: 'wishlists' }
);
WishlistSchema.plugin(tenantIsolationPlugin);
WishlistSchema.index({ tenantId: 1, customerId: 1 }, { unique: true });
export const WishlistModel = model<IWishlist>('Wishlist', WishlistSchema);
