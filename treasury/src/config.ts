/**
 * Configuration for Treasury Bot
 * Base mainnet addresses and settings
 */

import { NetworkConfig } from './types';

export const baseConfig: NetworkConfig = {
  chainId: 8453,
  rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',

  // Aerodrome V3 contracts on Base
  aerodromeRouter: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
  aerodromePositionManager: '0x4e9f0eb37A880b8BeF3e77e0e5d32e08Bd5bfb97',
  aerodromeFactory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',

  // Token addresses on Base
  usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  weth: '0x4200000000000000000000000000000000000006',

  // Treasury wallet (where LP tokens are minted to)
  treasuryAddress: process.env.TREASURY_ADDRESS || '0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad',

  // Relayer for on-chain transactions
  relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY || '',
};

// Monitor configuration
export const monitorConfig = {
  // How often to collect fees (ms)
  feeCollectionInterval: 1 * 60 * 60 * 1000,  // 1 hour

  // How often to report metrics (ms)
  metricsReportInterval: 1 * 60 * 60 * 1000,  // 1 hour

  // How often to check if rebalance is needed (ms)
  rebalanceCheckInterval: 6 * 60 * 60 * 1000,  // 6 hours

  // Slack webhook for alerts (optional)
  slackWebhook: process.env.SLACK_WEBHOOK || '',

  // Dune API for metric reporting (optional)
  duneApiKey: process.env.DUNE_API_KEY || '',
  duneDashboardId: process.env.DUNE_DASHBOARD_ID || '',

  // Database for persistent storage (optional)
  dbUrl: process.env.DATABASE_URL || '',
};

// LP position defaults
export const lpConfig = {
  // Tick range for USDC-WETH position (wide = capital efficient but less concentrated)
  tickLower: -887200,   // Full range lower
  tickUpper: 887200,    // Full range upper

  // Slippage tolerance (%)
  slippageTolerance: 5,

  // Auto-rebalance if price moves beyond this % from center
  rebalanceThreshold: 20,  // 20%
};

export function validateConfig(): string[] {
  const errors: string[] = [];

  if (!baseConfig.treasuryAddress) {
    errors.push('TREASURY_ADDRESS not set');
  }
  if (!baseConfig.relayerPrivateKey) {
    errors.push('RELAYER_PRIVATE_KEY not set');
  }
  if (!baseConfig.rpcUrl) {
    errors.push('BASE_RPC_URL not set');
  }

  return errors;
}
