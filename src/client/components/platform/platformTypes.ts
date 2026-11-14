/**
 * Shared Types & Utilities for NEXORA Phase 09 Super Admin Dashboard
 */

export type ApiCallFn = (
  path: string,
  init?: RequestInit
) => Promise<{ res: Response; json: any }>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface ConfirmActionConfig {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
}

export interface PlatformOverviewData {
  viewer: {
    userId: string;
    email: string;
    fullName: string;
    platformRoleSlug: string | null;
    platformRoleName: string;
    permissions: string[];
  };
  totals: {
    totalTenants: number;
    activeStores: number;
    suspendedStores: number;
    officialStores: number;
    totalRegisteredUsers: number;
    activeUsers: number;
    activeSubscriptions: number;
    freePlansCount: number;
    paidPlansCount: number;
    subscriptionMrrBDT: number;
    subscriptionMrrUSD: number;
    totalTransactionVolumeBDT: number;
    totalPaymentsCount: number;
    pendingRefundsCount: number;
    storageUsedMB: number;
    storageQuotaMB: number;
    securityAlertsCount: number;
  };
  charts: {
    revenueTrend: Array<{
      month: string;
      subscriptionMrrBDT: number;
      transactionVolumeBDT: number;
      activeTenants: number;
    }>;
    planDistribution: Array<{
      code: string;
      name: string;
      isFree: boolean;
      count: number;
      monthlyRevenueBDT: number;
    }>;
    paymentStatusBreakdown: Array<{
      status: string;
      count: number;
      amountBDT: number;
    }>;
    storageByTenant: Array<{
      tenantId: string;
      name: string;
      slug: string;
      planCode: string;
      usedMB: number;
      quotaMB: number;
      utilizationPct: number;
    }>;
  };
  systemHealth: {
    status: string;
    uptimeSeconds: number;
    memoryRssMB: number;
    heapUsedMB: number;
    activeSessions: number;
    nodeVersion: string;
    timestamp: string;
  };
  recentActivity: Array<{
    id: string;
    scope: string;
    actorEmail?: string;
    actorRole: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    outcome: 'ALLOWED' | 'DENIED';
    reason?: string;
    createdAt: string;
  }>;
  recentTransactions: Array<{
    id: string;
    tenantName: string;
    orderNumber: string;
    gateway: string;
    gatewayTransactionId: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
  }>;
  securityAlerts: Array<{
    id: string;
    severity: 'HIGH' | 'MEDIUM';
    category: string;
    actor: string;
    message: string;
    timestamp: string;
  }>;
}

export function triggerCsvDownload(filename: string, csvText: string): void {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
