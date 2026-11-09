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
import { setupInternalOfferHexagon, setupOfferHexagon } from '@modules/offer';
import { setupUserReplicaHexagon } from '@modules/user-replica';
import { setupKafkaConsumersHexagon } from '@modules/event';
import { PrismaOutboxRepository } from '@share/outbox/repository';
import { KafkaProducerClient } from '@share/component/kafka';
import { OutboxRelay } from '@share/outbox/relay';

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

  // 2. Initialize Outbox and Kafka Producer
  const outboxRepository = new PrismaOutboxRepository(prisma);
  const kafkaProducer = new KafkaProducerClient();
  const outboxRelay = new OutboxRelay(outboxRepository, kafkaProducer);

  try {
    await kafkaProducer.connect();
    console.log('[kafka] Connected to Kafka successfully.');
  } catch (error) {
    console.warn(
      '[kafka] Kafka broker not available on startup. Outbox relay will retry on demand.',
      error,
    );
  }

  outboxRelay.start();

  // 3. Initialize User Replica & Kafka Consumers (Phase 8)
  const userReplicaHexagon = setupUserReplicaHexagon(prisma);
  const kafkaConsumersHexagon = setupKafkaConsumersHexagon(
    prisma,
    userReplicaHexagon.useCase,
  );
  await kafkaConsumersHexagon.consumerManager.start();

  // 4. Create Express app
  const app = express();
  const port = config.port;

  app.use(express.json());
  app.use(morgan('dev'));

  // 4. Setup middleware factory with User Service token introspector
  const introspector = new TokenIntrospectRPCClient(config.verifyTokenUrl);
  const sctx: ServiceContext = {
    mdlFactory: setupMiddlewares(introspector),
  };

  // 5. Health check (no auth required)
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'trading-service' });
  });

  // 6. Mount module hexagons
  app.use('/api/v1', setupListingHexagon(prisma, sctx));
  app.use('/api/v1', setupOfferHexagon(prisma, sctx, outboxRepository));

  // 7. Mount internal routes (protected by X-Service-Key for Payment service)
  app.use(
    '/internal/v1',
    setupInternalOfferHexagon(
      prisma,
      sctx.mdlFactory.serviceKey([config.serviceKeys.payment]),
    ),
  );

  // 8. Global error handler (same pattern as sample)
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    responseErr(err, req, res);
  });

  // 8. Start server
  const server = app.listen(port, () => {
    console.log(`[server] Trading Service is running on http://localhost:${port}`);
  });

  // 9. Graceful shutdown
  const shutdown = async () => {
    console.log('[server] Shutting down...');
    outboxRelay.stop();
    await kafkaConsumersHexagon.consumerManager.stop();
    await kafkaProducer.disconnect();
    server.close();
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})();
