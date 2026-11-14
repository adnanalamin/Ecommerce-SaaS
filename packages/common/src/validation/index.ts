/**
 * NEXORA Multi-Tenant SaaS E-Commerce Platform
 * Shared Zod Validation Schemas
 */

import { z } from 'zod';
import { RESERVED_SUBDOMAINS } from '../constants/index.ts';

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  sortBy: z.string().trim().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const TenantRegistrationSchema = z.object({
  storeName: z.string().trim().min(2, 'Store name must be at least 2 characters').max(60),
  subdomain: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Subdomain must be at least 3 characters')
    .max(30, 'Subdomain must not exceed 30 characters')
    .regex(/^[a-z0-9-]+$/, 'Subdomain can only contain lowercase alphanumeric characters and hyphens')
    .refine((val) => !RESERVED_SUBDOMAINS.includes(val as (typeof RESERVED_SUBDOMAINS)[number]), {
      message: 'This subdomain is reserved by the platform',
    }),
  ownerEmail: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  currency: z.enum(['BDT', 'USD', 'EUR', 'GBP']).default('BDT'),
});

export type TenantRegistrationInput = z.infer<typeof TenantRegistrationSchema>;
export type PaginationQueryInput = z.infer<typeof PaginationQuerySchema>;
