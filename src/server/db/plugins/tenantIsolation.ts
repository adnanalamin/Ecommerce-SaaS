/**
 * NEXORA Database Architecture
 * Global Mongoose Plugin for Strict Tenant Isolation
 */

import { Schema } from 'mongoose';
import { tenantAsyncStorage } from '../../middleware/tenantContext.ts';

export interface TenantScopedDocument {
  tenantId: Schema.Types.ObjectId | string;
}

/**
 * Automatically injects tenantId: ObjectId into schema definitions
 * and pre-hooks find, findOne, countDocuments, update, and delete queries
 * to ensure that all database operations are isolated by default.
 */
export function tenantIsolationPlugin(schema: Schema): void {
  // 1. Add tenantId field if not already defined
  if (!schema.path('tenantId')) {
    schema.add({
      tenantId: {
        type: Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true,
        index: true,
      },
    });
  }

  // 2. Query methods to intercept and inject tenant context
  const queryMethods = [
    'find',
    'findOne',
    'findOneAndUpdate',
    'findOneAndDelete',
    'findOneAndReplace',
    'countDocuments',
    'updateMany',
    'updateOne',
    'deleteMany',
    'deleteOne',
  ] as const;

  queryMethods.forEach((method) => {
    schema.pre(method, function () {
      const context = tenantAsyncStorage.getStore();
      const options = this.getOptions();

      // Check for explicit bypass option (e.g., Super Admin cross-tenant audit jobs)
      if (options && options.bypassTenantCheck === true) {
        return;
      }

      // If a tenant context is active in the current async execution stack, enforce it
      if (context && context.tenantId) {
        this.where({ tenantId: context.tenantId });
      }
    });
  });
}
