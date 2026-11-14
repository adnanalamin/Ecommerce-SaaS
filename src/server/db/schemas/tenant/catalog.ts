/**
 * NEXORA Database Architecture
 * Categories, Brands, Products, Variants, Attributes & Inventory Schemas
 */

import { Schema, model, Document, Types } from 'mongoose';
import { tenantIsolationPlugin } from '../../plugins/tenantIsolation.ts';
import { softDeletePlugin } from '../../plugins/softDelete.ts';

// 1. CATEGORIES COLLECTION (Hierarchical Taxonomy)
export interface ICategory extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  parentId?: Types.ObjectId;
  displayOrder: number;
  imageUrl?: string;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const CategorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    displayOrder: { type: Number, default: 0 },
    imageUrl: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'categories' }
);
CategorySchema.plugin(tenantIsolationPlugin);
CategorySchema.plugin(softDeletePlugin);
CategorySchema.index({ tenantId: 1, slug: 1 }, { unique: true });
CategorySchema.index({ tenantId: 1, parentId: 1, displayOrder: 1 });
export const CategoryModel = model<ICategory>('Category', CategorySchema);

// 2. BRANDS COLLECTION (Brand Directory)
export interface IBrand extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  slug: string;
  logoUrl?: string;
  websiteUrl?: string;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const BrandSchema = new Schema<IBrand>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    logoUrl: { type: String, trim: true },
    websiteUrl: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'brands' }
);
BrandSchema.plugin(tenantIsolationPlugin);
BrandSchema.plugin(softDeletePlugin);
BrandSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
export const BrandModel = model<IBrand>('Brand', BrandSchema);

// 3. PRODUCT ATTRIBUTES COLLECTION (e.g. Size, Color, Fabric)
export interface IProductAttribute extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  code: string;
  values: string[];
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export const ProductAttributeSchema = new Schema<IProductAttribute>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, lowercase: true },
    values: { type: [String], required: true, default: [] },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'product_attributes' }
);
ProductAttributeSchema.plugin(tenantIsolationPlugin);
ProductAttributeSchema.index({ tenantId: 1, code: 1 }, { unique: true });
export const ProductAttributeModel = model<IProductAttribute>('ProductAttribute', ProductAttributeSchema);

// 4. PRODUCTS COLLECTION (Master Catalog Item)
export interface IProductImage {
  url: string;
  altText?: string;
  isPrimary: boolean;
  displayOrder: number;
}

export interface IProduct extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  title: string;
  slug: string;
  descriptionHtml?: string;
  categoryId?: Types.ObjectId;
  brandId?: Types.ObjectId;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  basePrice: number;
  compareAtPrice?: number;
  sku: string;
  barcode?: string;
  hasVariants: boolean;
  totalStock: number;
  averageRating: number;
  reviewCount: number;
  tags: string[];
  images: IProductImage[];
  seo: {
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
  };
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const ProductSchema = new Schema<IProduct>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, trim: true, lowercase: true },
    descriptionHtml: { type: String, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', index: true },
    brandId: { type: Schema.Types.ObjectId, ref: 'Brand', index: true },
    status: { type: String, enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'], default: 'DRAFT', index: true },
    basePrice: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    sku: { type: String, required: true, trim: true, uppercase: true },
    barcode: { type: String, trim: true },
    hasVariants: { type: Boolean, default: false },
    totalStock: { type: Number, default: 0, min: 0 },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    tags: { type: [String], default: [], index: true },
    images: [
      {
        url: { type: String, required: true },
        altText: { type: String },
        isPrimary: { type: Boolean, default: false },
        displayOrder: { type: Number, default: 0 },
      },
    ],
    seo: {
      metaTitle: { type: String, trim: true },
      metaDescription: { type: String, trim: true },
      keywords: { type: [String], default: [] },
    },
  },
  { timestamps: true, collection: 'products' }
);
ProductSchema.plugin(tenantIsolationPlugin);
ProductSchema.plugin(softDeletePlugin);
ProductSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
ProductSchema.index({ tenantId: 1, sku: 1 }, { unique: true });
ProductSchema.index({ tenantId: 1, categoryId: 1, status: 1 });
ProductSchema.index({ tenantId: 1, basePrice: 1, status: 1 });
ProductSchema.index({ tenantId: 1, averageRating: -1 });
ProductSchema.index({ tenantId: 1, title: 'text', descriptionHtml: 'text', tags: 'text' });
export const ProductModel = model<IProduct>('Product', ProductSchema);

// 5. PRODUCT VARIANTS COLLECTION (Variant Combinations)
export interface IProductVariant extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  productId: Types.ObjectId;
  title: string;
  sku: string;
  barcode?: string;
  price: number;
  compareAtPrice?: number;
  stockQuantity: number;
  attributes: Record<string, string>;
  imageUrl?: string;
  weightGrams?: number;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const ProductVariantSchema = new Schema<IProductVariant>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    title: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true, uppercase: true },
    barcode: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    stockQuantity: { type: Number, required: true, default: 0, min: 0 },
    attributes: { type: Map, of: String, default: {} },
    imageUrl: { type: String, trim: true },
    weightGrams: { type: Number, min: 0 },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'product_variants' }
);
ProductVariantSchema.plugin(tenantIsolationPlugin);
ProductVariantSchema.index({ tenantId: 1, sku: 1 }, { unique: true });
ProductVariantSchema.index({ tenantId: 1, productId: 1, isDefault: 1 });
export const ProductVariantModel = model<IProductVariant>('ProductVariant', ProductVariantSchema);

// 6. INVENTORY LOGS COLLECTION (Immutable Stock Audit Trail)
export type InventoryChangeReason = 'PURCHASE_ORDER' | 'SALE_ORDER' | 'ORDER_CANCELLED' | 'MANUAL_ADJUSTMENT' | 'DAMAGE_WRITE_OFF';

export interface IInventory extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  variantId: Types.ObjectId;
  productId: Types.ObjectId;
  quantityChange: number;
  resultingStock: number;
  reason: InventoryChangeReason;
  referenceOrderId?: Types.ObjectId;
  actorUserId?: Types.ObjectId;
  notes?: string;
  createdAt: Date;
}

export const InventorySchema = new Schema<IInventory>(
  {
    variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    quantityChange: { type: Number, required: true },
    resultingStock: { type: Number, required: true },
    reason: {
      type: String,
      required: true,
      enum: ['PURCHASE_ORDER', 'SALE_ORDER', 'ORDER_CANCELLED', 'MANUAL_ADJUSTMENT', 'DAMAGE_WRITE_OFF'],
      index: true,
    },
    referenceOrderId: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'inventory' }
);
InventorySchema.plugin(tenantIsolationPlugin);
InventorySchema.index({ tenantId: 1, variantId: 1, createdAt: -1 });
export const InventoryModel = model<IInventory>('Inventory', InventorySchema);
