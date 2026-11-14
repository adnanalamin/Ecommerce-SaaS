/**
 * NEXORA Multi-Tenant SaaS E-Commerce Platform
 * Tenant Context Resolution Foundation (AsyncLocalStorage)
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { Request, Response, NextFunction } from 'express';
import { env } from '../../../packages/config/src/index.ts';

export interface TenantContext {
  tenantId?: string;
  subdomain?: string;
  customDomain?: string;
  isPlatformRoot: boolean;
  isOfficialStore: boolean;
}

export const tenantAsyncStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantContext(): TenantContext | undefined {
  return tenantAsyncStorage.getStore();
}

export function tenantContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const host = req.headers.host || '';
  const cleanHost = host.split(':')[0].toLowerCase();

  const isPlatformRoot = cleanHost === env.PLATFORM_DOMAIN || cleanHost === 'localhost' || cleanHost === '127.0.0.1';
  const isOfficialStore = cleanHost === `store.${env.PLATFORM_DOMAIN}`;

  let subdomain: string | undefined;
  if (!isPlatformRoot && cleanHost.endsWith(`.${env.PLATFORM_DOMAIN}`)) {
    subdomain = cleanHost.replace(`.${env.PLATFORM_DOMAIN}`, '');
  }

  const context: TenantContext = {
    subdomain,
    customDomain: !isPlatformRoot && !subdomain ? cleanHost : undefined,
    isPlatformRoot,
    isOfficialStore,
  };

  tenantAsyncStorage.run(context, () => {
    next();
  });
}
