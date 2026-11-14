/**
 * NEXORA Database Architecture
 * Global Mongoose Plugin for Soft Deletion
 */

import { Schema } from 'mongoose';

export interface SoftDeleteDocument {
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Schema.Types.ObjectId;
}

export function softDeletePlugin(schema: Schema): void {
  schema.add({
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  });

  const queryMethods = [
    'find',
    'findOne',
    'findOneAndUpdate',
    'countDocuments',
  ] as const;

  queryMethods.forEach((method) => {
    schema.pre(method, function () {
      const options = this.getOptions();
      if (!options || !options.includeDeleted) {
        this.where({ isDeleted: false });
      }
    });
  });
}
