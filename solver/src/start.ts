/**
 * EZ-Path Solver Framework — Express Server
 * Accepts swap intents, returns ranked routes, executes winning route
 */

import express, { Request, Response } from 'express';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { IntentListener } from './intent-listener';
import { Settlement } from './settlement';
import { solverConfig, solverServerConfig, validateConfig } from './config';
import { SwapIntent, SolverState, SolverMetrics } from './types';

// Validate config
const errors = validateConfig();
if (errors.length > 0) {
  console.error('❌ Configuration errors:');
  errors.forEach((e) => console.error(`   - ${e}`));
  process.exit(1);
}

// Setup viem clients
const publicClient = createPublicClient({
  chain: base,
  transport: http(solverConfig.rpcUrl),
});

const account = privateKeyToAccount(solverConfig.solverPrivateKey as `0x${string}`);

const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(solverConfig.rpcUrl),
});

// Initialize services
const intentListener = new IntentListener(solverConfig, publicClient);
const settlement = new Settlement(publicClient, walletClient, solverConfig);

// State
let solverState: SolverState = {
  activeIntents: new Map(),
  completedIntents: [],
  metrics: {
    timestamp: Date.now(),
    totalIntents: 0,
    executedIntents: 0,
    failedIntents: 0,
    routeDistribution: {
      ez_path: 0,
      treasury_lp: 0,
      direct_dex: 0,
    },
    avgExecutionTime: 0,
    avgSlippage: 0,
    totalVolume: 0n,
    totalFeesCaptured: 0n,
  },
};

// Route cache: Map<intentId, routes[]>
const routeCache = new Map<string, any[]>();

// Express app
const app = express();
app.use(express.json());

/**
 * Helper to serialize BigInt for JSON responses
 */
function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  return obj;
}

/**
 * POST /solver/submit-intent
 * Submit a swap intent and get ranked routes
 */
app.post('/solver/submit-intent', async (req: Request, res: Response) => {
  try {
    const { sellToken, buyToken, sellAmount, minBuyAmount, chain = 'base' } = req.body;

    if (!sellToken || !buyToken || !sellAmount) {
      return res.status(400).json({
        error: 'missing_params',
        message: 'Required: sellToken, buyToken, sellAmount',
      });
    }

    // Create intent
    const sellAmountBigInt = BigInt(sellAmount);
    const intent: SwapIntent = {
      id: `intent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      sellToken,
      buyToken,
      sellAmount: sellAmountBigInt,
      minBuyAmount: minBuyAmount ? BigInt(minBuyAmount) : sellAmountBigInt / 2n,
      deadline: Math.floor(Date.now() / 1000) + 3600,  // 1h from now
      nonce: Math.random().toString(36).slice(2),
      chain,
    };

    solverState.activeIntents.set(intent.id, intent);
    solverState.metrics.totalIntents++;

    // Get ranked routes
    const routes = await intentListener.submitIntent(intent);

    if (routes.length === 0) {
      return res.status(422).json({
        error: 'no_routes',
        message: 'No routes meet the minimum buy amount',
        intent,
      });
    }

    // Cache routes for execution
    routeCache.set(intent.id, routes);

    return res.status(200).json(serializeBigInt({
      intentId: intent.id,
      routes,
      bestRoute: routes[0],
      message: `Got ${routes.length} routes, best is ${routes[0].source}`,
    }));
  } catch (error) {
    console.error('Submit intent error:', error);
    return res.status(500).json({
      error: 'server_error',
      message: String(error),
    });
  }
});

/**
 * POST /solver/execute
 * Execute the selected route for an intent
 */
app.post('/solver/execute', async (req: Request, res: Response) => {
  try {
    const { intentId, routeId } = req.body;

    if (!intentId || !routeId) {
      return res.status(400).json({
        error: 'missing_params',
        message: 'Required: intentId, routeId',
      });
    }

    const intent = solverState.activeIntents.get(intentId);
    if (!intent) {
      return res.status(404).json({
        error: 'intent_not_found',
        message: `Intent ${intentId} not found`,
      });
    }

    console.log(`\n🚀 Executing intent ${intentId} with route ${routeId}`);

    // Get routes from cache
    let routes = routeCache.get(intentId);
    if (!routes) {
      // Fallback: re-query if cache miss (shouldn't happen in normal flow)
      console.log('   ⚠️  Route cache miss, re-querying...');
      routes = await intentListener.submitIntent(intent);
      routeCache.set(intentId, routes);
    }

    const route = routes.find((r) => r.routeId === routeId);

    if (!route) {
      return res.status(404).json({
        error: 'route_not_found',
        message: `Route ${routeId} not found`,
      });
    }

    // Execute
    const result = await settlement.executeRoute(intent, route);

    // Record on-chain
    await settlement.recordOnChain(result, route);

    // Update metrics
    solverState.metrics.executedIntents++;
    solverState.metrics.routeDistribution[route.source as any]++;
    solverState.metrics.totalVolume += intent.sellAmount;
    solverState.metrics.totalFeesCaptured += route.feeAmount;

    // Store in completed
    solverState.completedIntents.push({
      intent,
      routes,
      selectedRoute: route,
      executed: result,
    });

    // Remove from active
    solverState.activeIntents.delete(intentId);

    return res.status(200).json(serializeBigInt({
      result,
      message: result.status === 'success' ? '✅ Executed successfully' : '❌ Execution failed',
    }));
  } catch (error) {
    console.error('Execute error:', error);
    return res.status(500).json({
      error: 'server_error',
      message: String(error),
    });
  }
});

/**
 * GET /solver/metrics
 * Get solver metrics
 */
app.get('/solver/metrics', (req: Request, res: Response) => {
  return res.status(200).json({
    timestamp: Date.now(),
    ...solverState.metrics,
    activeIntents: solverState.activeIntents.size,
    completedIntents: solverState.completedIntents.length,
  });
});

/**
 * GET /solver/health
 * Health check
 */
app.get('/solver/health', (req: Request, res: Response) => {
  return res.status(200).json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    activeIntents: solverState.activeIntents.size,
  });
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'not_found',
    message: `${req.method} ${req.path} not found`,
  });
});

/**
 * Start server
 */
function start(): void {
  console.log('═══════════════════════════════════════════════════');
  console.log('   EZ-Path Solver Framework v0.1.0');
  console.log('═══════════════════════════════════════════════════\n');

  console.log('📋 Configuration:');
  console.log(`   Port: ${solverConfig.port}`);
  console.log(`   Host: ${solverConfig.host}`);
  console.log(`   Chain: Base (${solverConfig.chainId})`);
  console.log(`   EZ-Path endpoint: ${solverConfig.ezPathUrl}`);
  console.log(`   Treasury LP: ${solverConfig.treasuryLpAddress}\n`);

  app.listen(solverConfig.port, solverConfig.host, () => {
    console.log(`✅ Solver listening at http://${solverConfig.host}:${solverConfig.port}`);
    console.log(`\nEndpoints:`);
    console.log(`   POST /solver/submit-intent — Submit swap intent`);
    console.log(`   POST /solver/execute — Execute route for intent`);
    console.log(`   GET  /solver/metrics — View metrics`);
    console.log(`   GET  /solver/health — Health check\n`);
  });

  // Periodic metrics log
  setInterval(() => {
    console.log('\n📊 Solver Metrics');
    console.log('═══════════════════════════════════════════════════');
    console.log(`Total intents: ${solverState.metrics.totalIntents}`);
    console.log(`Executed: ${solverState.metrics.executedIntents}`);
    console.log(`Failed: ${solverState.metrics.failedIntents}`);
    console.log(`Active: ${solverState.activeIntents.size}`);
    console.log(`Volume: ${solverState.metrics.totalVolume}`);
    console.log(`Fees captured: ${solverState.metrics.totalFeesCaptured}`);
    console.log(`Route distribution:`);
    console.log(`  EZ-Path: ${solverState.metrics.routeDistribution.ez_path}`);
    console.log(`  Treasury LP: ${solverState.metrics.routeDistribution.treasury_lp}`);
    console.log(`  Direct DEX: ${solverState.metrics.routeDistribution.direct_dex}`);
    console.log('═══════════════════════════════════════════════════\n');
  }, solverServerConfig.metricsInterval);
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  console.log(`Final metrics:`);
  console.log(`  Executed: ${solverState.metrics.executedIntents}`);
  console.log(`  Failed: ${solverState.metrics.failedIntents}`);
  console.log(`  Total volume: ${solverState.metrics.totalVolume}`);
  process.exit(0);
});

// Start
start();
