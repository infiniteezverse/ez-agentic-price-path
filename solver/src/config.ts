/**
 * Solver Configuration
 * Base mainnet setup, service endpoints, contracts
 */

import { SolverConfig } from './types';

export const solverConfig: SolverConfig = {
  chainId: 8453,
  rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',

  // Service endpoints (query these to get quotes)
  ezPathUrl: process.env.EZPATH_URL || 'https://ezpath.myezverse.xyz',
  treasuryLpAddress: process.env.TREASURY_LP_ADDRESS || '0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad',
  treasuryRegistryAddress:
    process.env.TREASURY_REGISTRY_ADDRESS || '0x0000000000000000000000000000000000000000',

  // Solver contract (records intents)
  solverRegistryAddress: process.env.SOLVER_REGISTRY_ADDRESS || '0x0000000000000000000000000000000000000000',
  solverPrivateKey: process.env.SOLVER_PRIVATE_KEY || '',

  // Express server
  port: parseInt(process.env.SOLVER_PORT || '3001', 10),
  host: process.env.SOLVER_HOST || '0.0.0.0',
};

export const solverServerConfig = {
  // Request timeout (ms)
  requestTimeout: 30000,

  // Quote timeout per service (ms)
  quoteTimeout: 5000,

  // Max intents in memory
  maxIntents: 10000,

  // Metrics reporting interval (ms)
  metricsInterval: 60 * 1000,  // 1 minute

  // Auto-cleanup old intents (ms)
  intentTTL: 24 * 60 * 60 * 1000,  // 24 hours
};

export function validateConfig(): string[] {
  const errors: string[] = [];

  if (!solverConfig.rpcUrl) {
    errors.push('BASE_RPC_URL not set');
  }
  if (!solverConfig.solverPrivateKey) {
    errors.push('SOLVER_PRIVATE_KEY not set');
  }

  return errors;
}
