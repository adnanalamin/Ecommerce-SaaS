/**
 * NEXORA Database Management & Verification Routes
 * Exposes database status, full 35-collection dictionary, verification suite runner, and seed trigger.
 */

import { Router, Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/apiResponse.ts';
import { getDatabaseHealth } from '../../config/database.ts';
import { NEXORA_COLLECTION_REGISTRY } from '../../db/models.ts';
import { runDatabaseVerificationSuite } from '../../db/testDatabase.ts';
import { runDatabaseSeed } from '../../db/seed.ts';
import { logger } from '../../utils/logger.ts';

export const databaseRouter = Router();

/**
 * GET /api/v1/database/status
 * Returns database connectivity, connection metrics, and the full 35 collections data dictionary.
 */
databaseRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const health = await getDatabaseHealth();
    return sendSuccess(res, {
      status: 'operational',
      databaseHealth: health,
      collectionsCount: NEXORA_COLLECTION_REGISTRY.length,
      globalCollectionsCount: NEXORA_COLLECTION_REGISTRY.filter((c) => c.domain === 'GLOBAL').length,
      tenantCollectionsCount: NEXORA_COLLECTION_REGISTRY.filter((c) => c.domain === 'TENANT').length,
      collections: NEXORA_COLLECTION_REGISTRY,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to query database status';
    return sendError(res, 500, 'DB_STATUS_ERROR', msg);
  }
});

/**
 * GET or POST /api/v1/database/verify
 * Runs the programmatic verification suite testing schema validation, tenant isolation, and indexes.
 */
databaseRouter.all('/verify', async (_req: Request, res: Response) => {
  try {
    logger.info('[API] Triggering Database Architecture Verification Suite...');
    const report = await runDatabaseVerificationSuite();
    return sendSuccess(res, report, 200);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Database verification error';
    logger.error('[API] Database verification failed', { error: msg });
    return sendError(res, 500, 'VERIFY_ERROR', msg);
  }
});

/**
 * POST /api/v1/database/seed
 * Executes default seed routine (plans, superadmin, official tenant, sample merchant).
 */
databaseRouter.post('/seed', async (_req: Request, res: Response) => {
  try {
    const health = await getDatabaseHealth();
    if (health.status !== 'UP') {
      return sendSuccess(res, {
        simulated: true,
        message: 'Sandbox mode active: Simulated seed generated (Connect real MongoDB instance via MONGODB_URI for persistence).',
        counts: {
          plans: 4,
          systemSettings: 4,
          users: 2,
          tenants: 2,
          stores: 2,
          categories: 2,
          brands: 1,
          products: 1,
          variants: 3,
          inventory: 3,
          shippingMethods: 2,
          themes: 1,
        },
      }, 200);
    }

    const seedResult = await runDatabaseSeed();
    return sendSuccess(res, seedResult, 200);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Database seed failed';
    logger.error('[API] Database seed failed', { error: msg });
    return sendError(res, 500, 'SEED_ERROR', msg);
  }
});
