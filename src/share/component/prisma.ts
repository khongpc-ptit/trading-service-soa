import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { config } from './config';

/**
 * PrismaClient singleton with PostgreSQL driver adapter (Prisma 7).
 * Follows same pattern: single shared instance for the process.
 */
const pool = new Pool({
  connectionString: config.database.url,
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV !== 'production' ? ['query', 'warn', 'error'] : ['error'],
});

export { pool };

