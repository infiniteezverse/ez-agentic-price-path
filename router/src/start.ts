/**
 * EZ-Path Open Router
 * Public-facing route aggregator
 * Combines: EZ-Path Core + Solver Framework + Treasury Bot
 */

import express, { Request, Response } from 'express';
import axios from 'axios';
import { RouteRequest, BestRoute, RouterMetrics, RouterConfig } from './types';

const config: RouterConfig = {
  port: parseInt(process.env.ROUTER_PORT || '3000', 10),
  host: process.env.ROUTER_HOST || '0.0.0.0',
  ezPathUrl: process.env.EZPATH_URL || 'https://ezpath.myezverse.xyz',
  solverUrl: process.env.SOLVER_URL || 'http://localhost:3001',
  treasuryUrl: process.env.TREASURY_URL || 'http://localhost:3002',
  rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
};

const app = express();
app.use(express.json());

let metrics: RouterMetrics = {
  timestamp: Date.now(),
  totalRoutes: 0,
  uniqueUsers: new Set<string>().size,
  totalVolume: 0n,
  avgExecutionTime: 0,
  sourceDistribution: {
    ez_path: 0,
    treasury_lp: 0,
    direct_dex: 0,
  },
};

/**
 * GET /router/quote
 * Get best route for a swap across all sources
 */
app.get('/router/quote', async (req: Request, res: Response) => {
  try {
    const { chain = 'base', sellToken, buyToken, sellAmount, slippagePercentage = 0.01 } = req.query;

    if (!sellToken || !buyToken || !sellAmount) {
      return res.status(400).json({
        error: 'missing_params',
        message: 'Required: sellToken, buyToken, sellAmount',
      });
    }

    console.log(`\n🔀 Route request: ${sellAmount} of ${String(sellToken).slice(0, 8)}...`);

    // 1. Query Solver (which queries EZ-Path, Treasury LP, Direct DEX)
    const solverRoutes = await axios.post(
      `${config.solverUrl}/solver/submit-intent`,
      {
        sellToken,
        buyToken,
        sellAmount,
        minBuyAmount: (BigInt(String(sellAmount)) * 99n) / 100n,  // 1% slippage
        chain,
      },
      { timeout: 30000 },
    );

    if (!solverRoutes.data.routes || solverRoutes.data.routes.length === 0) {
      return res.status(422).json({
        error: 'no_routes',
        message: 'No routes available',
      });
    }

    const routes = solverRoutes.data.routes;
    const bestRoute = routes[0];

    console.log(`✅ Best route: ${bestRoute.source}`);
    console.log(`   Buy amount: ${bestRoute.buyAmount}`);
    console.log(`   Fee: ${bestRoute.feeAmount} (${bestRoute.feePercentage}%)`);

    // Calculate price impact
    const priceImpact = ((Number(bestRoute.feeAmount) / Number(sellAmount)) * 100).toFixed(3);

    const response: BestRoute = {
      route: {
        routeId: bestRoute.routeId,
        source: bestRoute.source,
        buyAmount: BigInt(bestRoute.buyAmount),
        price: (Number(bestRoute.buyAmount) / Number(sellAmount)).toFixed(6),
        priceImpact: parseFloat(priceImpact),
        feeAmount: BigInt(bestRoute.feeAmount),
        feePercentage: bestRoute.feePercentage,
        executionTime: bestRoute.executionTime,
        slippage: slippagePercentage as number,
        metadata: bestRoute.metadata,
      },
      feeBreakdown: {
        x402_fee: bestRoute.source === 'ez-path' ? BigInt(bestRoute.feeAmount) : undefined,
        lp_fee: bestRoute.source === 'treasury-lp' ? BigInt(bestRoute.feeAmount) : undefined,
        dex_fee: bestRoute.source === 'direct-dex' ? BigInt(bestRoute.feeAmount) : undefined,
      },
    };

    // Update metrics
    metrics.totalRoutes++;
    metrics.totalVolume += BigInt(String(sellAmount));
    metrics.sourceDistribution[bestRoute.source as any]++;

    return res.status(200).json(response);
  } catch (error) {
    console.error('Route error:', error);
    return res.status(500).json({
      error: 'server_error',
      message: String(error),
    });
  }
});

/**
 * GET /router/metrics
 * Router metrics
 */
app.get('/router/metrics', (req: Request, res: Response) => {
  return res.status(200).json({
    timestamp: Date.now(),
    ...metrics,
    uniqueUsers: new Set<string>().size,
  });
});

/**
 * GET /router/health
 * Health check
 */
app.get('/router/health', (req: Request, res: Response) => {
  return res.status(200).json({
    status: 'ok',
    timestamp: Date.now(),
    services: {
      ezpath: 'https://ezpath.myezverse.xyz',
      solver: config.solverUrl,
      treasury: config.treasuryUrl,
    },
  });
});

/**
 * 404
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'not_found',
    message: `${req.method} ${req.path} not found`,
  });
});

/**
 * Start
 */
function start() {
  console.log('═══════════════════════════════════════════════════');
  console.log('   EZ-Path Open Router v0.1.0');
  console.log('═══════════════════════════════════════════════════\n');

  console.log('📋 Configuration:');
  console.log(`   Port: ${config.port}`);
  console.log(`   Host: ${config.host}`);
  console.log(`   EZ-Path: ${config.ezPathUrl}`);
  console.log(`   Solver: ${config.solverUrl}`);
  console.log(`   Treasury: ${config.treasuryUrl}\n`);

  app.listen(config.port, config.host, () => {
    console.log(`✅ Router listening at http://${config.host}:${config.port}`);
    console.log(`\nEndpoints:`);
    console.log(`   GET  /router/quote — Get best route for swap`);
    console.log(`   GET  /router/metrics — View metrics`);
    console.log(`   GET  /router/health — Health check\n`);
  });

  // Periodic metrics log
  setInterval(() => {
    console.log('\n📊 Router Metrics');
    console.log('═══════════════════════════════════════════════════');
    console.log(`Total routes: ${metrics.totalRoutes}`);
    console.log(`Total volume: ${metrics.totalVolume}`);
    console.log(`Distribution:`);
    console.log(`  EZ-Path: ${metrics.sourceDistribution.ez_path}`);
    console.log(`  Treasury LP: ${metrics.sourceDistribution.treasury_lp}`);
    console.log(`  Direct DEX: ${metrics.sourceDistribution.direct_dex}`);
    console.log('═══════════════════════════════════════════════════\n');
  }, 60 * 1000);
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  console.log(`Final metrics:`);
  console.log(`  Total routes: ${metrics.totalRoutes}`);
  console.log(`  Total volume: ${metrics.totalVolume}`);
  process.exit(0);
});

start();
