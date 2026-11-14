/**
 * NEXORA Multi-Tenant SaaS E-Commerce Platform
 * Health Check Endpoints
 */

import { Router, Request, Response } from 'express';
import { getDatabaseHealth } from '../config/database.ts';
import { sendSuccess } from '../utils/apiResponse.ts';
import { env } from '../../../packages/config/src/index.ts';
import { HealthCheckResponse } from '../../../packages/common/src/index.ts';

export const healthRouter = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  const dbHealth = await getDatabaseHealth();
  const mem = process.memoryUsage();

  const isHealthy = dbHealth.status !== 'DOWN';
  const overallStatus: HealthCheckResponse['status'] = isHealthy ? 'UP' : 'DEGRADED';

  const healthData: HealthCheckResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: env.NODE_ENV,
    version: '1.0.0',
    services: {
      database: dbHealth,
      memory: {
        rssMB: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
        heapTotalMB: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
        heapUsedMB: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
      },
    },
  };

  sendSuccess(res, healthData, isHealthy ? 200 : 503);
});
