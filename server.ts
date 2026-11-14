/**
 * NEXORA Multi-Tenant SaaS E-Commerce Platform
 * Full-Stack Server Entry Point
 */

import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createExpressApp } from './src/server/app.ts';
import { connectToDatabase, disconnectFromDatabase } from './src/server/config/database.ts';
import { env } from './packages/config/src/index.ts';
import { logger } from './src/server/utils/logger.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer(): Promise<void> {
  const app = createExpressApp();
  const isProduction = env.NODE_ENV === 'production';
  const port = env.PORT;

  logger.info(`[NEXORA Boot] Starting platform server in ${env.NODE_ENV.toUpperCase()} mode...`);

  // 1. Connect Database (Non-blocking fallback for dev sandboxes)
  await connectToDatabase();

  // 2. Setup Frontend Ingress (Vite middleware in dev, static files in prod)
  if (!isProduction) {
    logger.info('[Vite] Initializing Vite development server in middleware mode...');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    logger.info('[Vite] Development middleware mounted successfully.');
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    logger.info(`[Production] Serving static frontend build from: ${distPath}`);
    app.use(express.static(distPath));

    app.get('*', (req, res, next) => {
      if (req.originalUrl.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  // 3. Start Listening
  const server = app.listen(port, '0.0.0.0', () => {
    logger.info(`=======================================================`);
    logger.info(`  NEXORA Platform Server running on port ${port}        `);
    logger.info(`  Local URL:        http://localhost:${port}            `);
    logger.info(`  Health Check:     http://localhost:${port}/api/health `);
    logger.info(`  API v1 Index:     http://localhost:${port}/api/v1     `);
    logger.info(`=======================================================`);
  });

  // 4. Graceful Shutdown Handlers
  const shutdown = async (signal: string) => {
    logger.info(`[Server] Received ${signal}. Commencing graceful shutdown...`);
    server.close(async () => {
      logger.info('[Server] HTTP listener closed.');
      await disconnectFromDatabase();
      logger.info('[Server] Graceful shutdown completed. Exiting.');
      process.exit(0);
    });

    // Force shutdown if cleanup hangs past 10 seconds
    setTimeout(() => {
      logger.error('[Server] Graceful shutdown timed out. Forcefully terminating.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((error) => {
  logger.error('[NEXORA Boot Failure] Fatal error during startup:', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
