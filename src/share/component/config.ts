import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

/**
 * Centralized configuration — adapted from sample.
 * PostgreSQL + Kafka + JWT RS256 (public key) + inter-service URLs.
 */
export const config = {
  port: parseInt(process.env.SERVER_PORT || '8083', 10),

  database: {
    url: process.env.DATABASE_URL || '',
  },

  kafka: {
    brokers: (process.env.KAFKA_BOOTSTRAP_SERVERS || 'localhost:9092').split(','),
    clientId: 'trading-service',
  },

  jwt: {
    publicKey: (() => {
      const keyPath = process.env.JWT_PUBLIC_KEY_PATH;
      if (keyPath) {
        try {
          return fs.readFileSync(path.resolve(keyPath), 'utf8');
        } catch {
          console.warn(`[config] JWT public key file not found at ${keyPath}, JWT verification will fail`);
          return '';
        }
      }
      // Fallback: allow inline key via env for development
      return process.env.JWT_PUBLIC_KEY || '';
    })(),
    issuer: process.env.JWT_ISSUER || 'urn:soa:user-service',
    audience: process.env.JWT_AUDIENCE || 'soa-api',
  },

  services: {
    userUrl: process.env.USER_SERVICE_URL || 'http://localhost:8081',
    farmingUrl: process.env.FARMING_SERVICE_URL || 'http://localhost:8082',
  },

  verifyTokenUrl: process.env.VERIFY_TOKEN_URL || `${process.env.USER_SERVICE_URL || 'http://localhost:8081'}/v1/rpc/introspect`,

  accessStateTimeoutMs: parseInt(process.env.ACCESS_STATE_TIMEOUT_MS || '1000', 10),

  serviceKeys: {
    payment: process.env.SERVICE_KEY_PAYMENT || '',
    tradingToFarming: process.env.SERVICE_KEY_TRADING_TO_FARMING || '',
  },

  nodeEnv: process.env.NODE_ENV || 'development',
};
