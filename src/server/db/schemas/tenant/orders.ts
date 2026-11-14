/**
 * NEXORA Database Architecture
 * Orders, Order Items, Payments, Refunds & Shipping Methods Schemas
 */

import { Schema, model, Document, Types } from 'mongoose';
import { tenantIsolationPlugin } from '../../plugins/tenantIsolation.ts';
import { softDeletePlugin } from '../../plugins/softDelete.ts';

// 1. ORDERS COLLECTION (Authoritative Commitments)
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';
export type PaymentStatus = 'UNPAID' | 'AUTHORIZED' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'FAILED';
export type FulfillmentStatus = 'UNFULFILLED' | 'PARTIAL' | 'FULFILLED';

export interface IOrder extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  orderNumber: string;
  customerId?: Types.ObjectId;
  customerEmail: string;
  customerPhone: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  currency: 'BDT' | 'USD' | 'EUR' | 'GBP';
  subtotalAmount: number;
  discountAmount: number;
  shippingFee: number;
  taxAmount: number;
  grandTotal: number;
  shippingAddress: {
    recipientName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    stateOrDivision: string;
    postalCode: string;
    country: string;
  };
  billingAddress: {
    recipientName: string;
    phone: string;
    addressLine1: string;
    city: string;
    postalCode: string;
    country: string;
  };
  shippingMethodId?: Types.ObjectId;
  appliedCouponId?: Types.ObjectId;
  customerNotes?: string;
  staffNotes?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const OrderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, trim: true, uppercase: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    customerEmail: { type: String, required: true, trim: true, lowercase: true },
    customerPhone: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'],
      default: 'PENDING',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['UNPAID', 'AUTHORIZED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED'],
      default: 'UNPAID',
      index: true,
    },
    fulfillmentStatus: {
      type: String,
      enum: ['UNFULFILLED', 'PARTIAL', 'FULFILLED'],
      default: 'UNFULFILLED',
      index: true,
    },
    currency: { type: String, default: 'BDT' },
    subtotalAmount: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    shippingFee: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    shippingAddress: { type: Schema.Types.Mixed, required: true },
    billingAddress: { type: Schema.Types.Mixed, required: true },
    shippingMethodId: { type: Schema.Types.ObjectId, ref: 'ShippingMethod' },
    appliedCouponId: { type: Schema.Types.ObjectId, ref: 'Coupon' },
    customerNotes: { type: String, trim: true },
    staffNotes: { type: String, trim: true },
  },
  { timestamps: true, collection: 'orders' }
);
OrderSchema.plugin(tenantIsolationPlugin);
OrderSchema.plugin(softDeletePlugin);
OrderSchema.index({ tenantId: 1, orderNumber: 1 }, { unique: true });
OrderSchema.index({ tenantId: 1, customerId: 1, createdAt: -1 });
OrderSchema.index({ tenantId: 1, status: 1, paymentStatus: 1 });
export const OrderModel = model<IOrder>('Order', OrderSchema);

// 2. ORDER ITEMS COLLECTION (Line Items Snapshots)
export interface IOrderItem extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  orderId: Types.ObjectId;
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  productTitle: string;
  variantTitle?: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  imageUrl?: string;
  createdAt: Date;
}

export const OrderItemSchema = new Schema<IOrderItem>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    productTitle: { type: String, required: true },
    variantTitle: { type: String },
    sku: { type: String, required: true },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    totalPrice: { type: Number, required: true, min: 0 },
    imageUrl: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'order_items' }
);
OrderItemSchema.plugin(tenantIsolationPlugin);
OrderItemSchema.index({ tenantId: 1, orderId: 1 });
export const OrderItemModel = model<IOrderItem>('OrderItem', OrderItemSchema);

// 3. PAYMENTS COLLECTION (Financial Transaction Ledger)
export type PaymentGateway = 'BKASH' | 'NAGAD' | 'ROCKET' | 'SSLCOMMERZ' | 'STRIPE' | 'PAYPAL' | 'BANK_TRANSFER' | 'COD';
export type TransactionStatus = 'INITIATED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'REVERSED';

export interface IPayment extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  orderId: Types.ObjectId;
  idempotencyKey: string;
  gateway: PaymentGateway;
  gatewayTransactionId?: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  paymentMethodDetails?: string;
  failureReason?: string;
  rawPayload?: Record<string, unknown>;
  initiatedAt: Date;
  settledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const PaymentSchema = new Schema<IPayment>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    idempotencyKey: { type: String, required: true, trim: true },
    gateway: {
      type: String,
      required: true,
      enum: ['BKASH', 'NAGAD', 'ROCKET', 'SSLCOMMERZ', 'STRIPE', 'PAYPAL', 'BANK_TRANSFER', 'COD'],
      index: true,
    },
    gatewayTransactionId: { type: String, trim: true, sparse: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'BDT' },
    status: {
      type: String,
      enum: ['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REVERSED'],
      default: 'INITIATED',
      index: true,
    },
    paymentMethodDetails: { type: String },
    failureReason: { type: String },
    rawPayload: { type: Schema.Types.Mixed },
    initiatedAt: { type: Date, default: Date.now },
    settledAt: { type: Date },
  },
  { timestamps: true, collection: 'payments' }
);
PaymentSchema.plugin(tenantIsolationPlugin);
PaymentSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true });
PaymentSchema.index({ gateway: 1, gatewayTransactionId: 1 }, { sparse: true });
export const PaymentModel = model<IPayment>('Payment', PaymentSchema);

// 4. REFUNDS COLLECTION
export interface IRefund extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  orderId: Types.ObjectId;
  paymentId: Types.ObjectId;
  amount: number;
  reason: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  gatewayRefundId?: string;
  actorUserId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const RefundSchema = new Schema<IRefund>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, trim: true },
    status: { type: String, enum: ['PENDING', 'COMPLETED', 'FAILED'], default: 'PENDING', index: true },
    gatewayRefundId: { type: String, trim: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'refunds' }
);
RefundSchema.plugin(tenantIsolationPlugin);
RefundSchema.index({ tenantId: 1, orderId: 1 });
export const RefundModel = model<IRefund>('Refund', RefundSchema);

// 5. SHIPPING METHODS COLLECTION
export interface IShippingMethod extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  code: string;
  description?: string;
  baseRateBDT: number;
  perItemRateBDT: number;
  freeShippingThresholdBDT?: number;
  estimatedDeliveryDays?: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const ShippingMethodSchema = new Schema<IShippingMethod>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, trim: true },
    baseRateBDT: { type: Number, required: true, default: 0, min: 0 },
    perItemRateBDT: { type: Number, default: 0, min: 0 },
    freeShippingThresholdBDT: { type: Number, min: 0 },
    estimatedDeliveryDays: { type: String, trim: true },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'shipping_methods' }
);
ShippingMethodSchema.plugin(tenantIsolationPlugin);
ShippingMethodSchema.index({ tenantId: 1, code: 1 }, { unique: true });
export const ShippingMethodModel = model<IShippingMethod>('ShippingMethod', ShippingMethodSchema);
