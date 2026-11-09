import 'module-alias/register';

import { config as dotenvConfig } from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import morgan from 'morgan';

import { responseErr } from '@share/app-error';
import { config } from '@share/component/config';
import { prisma, pool } from '@share/component/prisma';
import { setupMiddlewares } from '@share/middleware';
import { TokenIntrospectRPCClient } from '@share/repository/verify-token.rpc';
import { ServiceContext } from '@share/interface/service-context';
import { setupListingHexagon } from '@modules/listing';

dotenvConfig();

(async () => {
  // 1. Verify database connection
  try {
    await prisma.$connect();
    console.log('[db] PostgreSQL connection established successfully.');
  } catch (error) {
    console.error('[db] Failed to connect to PostgreSQL:', error);
    process.exit(1);
  }

  // 2. Create Express app
  const app = express();
  const port = config.port;

  app.use(express.json());
  app.use(morgan('dev'));

  // 3. Setup middleware factory with User Service token introspector
  const introspector = new TokenIntrospectRPCClient(config.verifyTokenUrl);
  const sctx: ServiceContext = {
    mdlFactory: setupMiddlewares(introspector),
  };

  // 4. Health check (no auth required)
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'trading-service' });
  });

  // 5. Mount module hexagons
  app.use('/api/v1', setupListingHexagon(prisma, sctx));

  // TODO (Phase 5): app.use('/api/v1', setupOfferHexagon(prisma, sctx));
  // TODO (Phase 7): app.use('/internal/v1', setupInternalRoutes(prisma, sctx));

  // 6. Global error handler (same pattern as sample)
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    responseErr(err, req, res);
  });

  // 7. Start server
  app.listen(port, () => {
    console.log(`[server] Trading Service is running on http://localhost:${port}`);
  });

  // 8. Graceful shutdown
  const shutdown = async () => {
    console.log('[server] Shutting down...');
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})();
