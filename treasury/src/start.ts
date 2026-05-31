/**
 * EZ-Path Treasury Bot — Main Entry Point
 * Runs: LP Manager + Swap Tracker + Metrics Reporter
 */

import { createPublicClient, createWalletClient, http, privateKeyToAccount } from 'viem';
import { base } from 'viem/chains';
import { LPManager } from './lp-manager';
import { SwapTracker } from './swap-tracker';
import { baseConfig, monitorConfig, lpConfig, validateConfig } from './config';
import { TreasuryStatus } from './types';

// Validate environment
const errors = validateConfig();
if (errors.length > 0) {
  console.error('❌ Configuration errors:');
  errors.forEach((e) => console.error(`   - ${e}`));
  process.exit(1);
}

// Setup viem clients
const publicClient = createPublicClient({
  chain: base,
  transport: http(baseConfig.rpcUrl),
});

const account = privateKeyToAccount(baseConfig.relayerPrivateKey as `0x${string}`);

const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(baseConfig.rpcUrl),
});

// Initialize managers
const lpManager = new LPManager(publicClient, walletClient, baseConfig);
const swapTracker = new SwapTracker(publicClient, baseConfig);

let treasuryStatus: TreasuryStatus = {
  lpPositions: [],
  totalLiquidity: 0n,
  feesAccumulated: 0n,
  dailyAPY: 0,
  agentVolumeToday: 0n,
  uniqueAgentsToday: 0,
  lastUpdated: Date.now(),
};

/**
 * Initialize treasury: Mint LP position and start tracking
 */
async function initialize(): Promise<void> {
  console.log('═══════════════════════════════════════════════════');
  console.log('   EZ-Path Treasury Bot v0.1.0');
  console.log('═══════════════════════════════════════════════════\n');

  // Check balances
  console.log('📊 Checking treasury balances...');
  const balances = await lpManager.getBalances();
  console.log(`   USDC: ${balances.usdc}`);
  console.log(`   WETH: ${balances.weth}\n`);

  if (balances.usdc === 0n) {
    console.warn(
      '⚠️  Treasury has no USDC balance. Please fund the treasury address first.',
    );
    console.warn(`   Treasury: ${baseConfig.treasuryAddress}`);
    return;
  }

  // Mint LP position with 50% of treasury USDC
  const usdcToUse = balances.usdc / 2n;
  const wethToUse = balances.weth / 2n;

  try {
    const position = await lpManager.mintPosition(
      usdcToUse,
      wethToUse,
      lpConfig.tickLower,
      lpConfig.tickUpper,
    );

    treasuryStatus.lpPositions.push(position);
    treasuryStatus.totalLiquidity = position.liquidity;
    treasuryStatus.lastUpdated = Date.now();

    console.log('\n✅ Treasury initialized successfully\n');
  } catch (error) {
    console.error('❌ Failed to initialize treasury:', error);
    process.exit(1);
  }

  // Start monitoring
  startMonitoring();
}

/**
 * Start background monitoring tasks
 */
function startMonitoring(): void {
  console.log('🚀 Starting background tasks...\n');

  // 1. Swap tracking
  swapTracker.startListening(baseConfig.aerodromeRouter);

  // 2. Hourly metrics reporting
  setInterval(async () => {
    await reportHourlyMetrics();
  }, monitorConfig.metricsReportInterval);

  // 3. Hourly fee collection
  setInterval(async () => {
    await collectFeesIfNeeded();
  }, monitorConfig.feeCollectionInterval);

  // 4. Daily status log
  setInterval(() => {
    logDailyStatus();
  }, 24 * 60 * 60 * 1000);

  // Log initial status
  logDailyStatus();
}

/**
 * Report hourly metrics
 */
async function reportHourlyMetrics(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const oneHourAgo = now - 3600;

  try {
    const metrics = await swapTracker.getMetrics(oneHourAgo, now);
    const duneMetric = swapTracker.exportForDune(metrics);

    console.log('\n📊 Hourly Metrics Report');
    console.log('═══════════════════════════════════════════════════');
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Total Swaps: ${metrics.totalSwaps}`);
    console.log(`Volume: ${metrics.totalVolumeUSDC} USDC`);
    console.log(`Fees Earned: ${metrics.feesEarned} USDC`);
    console.log(`Unique Swappers: ${metrics.uniqueSwappers}`);
    console.log(`APY: ${metrics.APY.toFixed(2)}%`);
    console.log(`Avg Swap Size: ${metrics.avgSwapSize}`);

    if (metrics.topSwappers.length > 0) {
      console.log('\nTop Swappers:');
      metrics.topSwappers.slice(0, 3).forEach((s) => {
        console.log(`  ${s.address.slice(0, 8)}... | ${s.volume} USDC | ${s.swapCount} swaps`);
      });
    }
    console.log('');

    // TODO: Push to Dune if API key is set
    if (monitorConfig.duneApiKey) {
      console.log('📤 Pushing metrics to Dune...');
      // await pushToDune(duneMetric);
    }
  } catch (error) {
    console.error('❌ Failed to report metrics:', error);
  }
}

/**
 * Collect fees if position has earned any
 */
async function collectFeesIfNeeded(): Promise<void> {
  if (treasuryStatus.lpPositions.length === 0) {
    return;
  }

  const position = treasuryStatus.lpPositions[0];

  try {
    console.log(`\n💰 Collecting fees from position ${position.tokenId}...`);
    const fees = await lpManager.collectFees(position.tokenId);
    treasuryStatus.feesAccumulated += fees.amount0 + fees.amount1;
    console.log(`✅ Fees collected: ${fees.amount0} + ${fees.amount1}`);
  } catch (error) {
    console.error('❌ Failed to collect fees:', error);
  }
}

/**
 * Log daily status
 */
function logDailyStatus(): void {
  const recentSwaps = swapTracker.getRecentSwaps(24);
  const uniqueAgents = new Set(recentSwaps.map((s) => s.swapper)).size;

  treasuryStatus.uniqueAgentsToday = uniqueAgents;
  treasuryStatus.agentVolumeToday = recentSwaps.reduce((acc, s) => acc + s.amountIn, 0n);
  treasuryStatus.lastUpdated = Date.now();

  console.log('\n═══════════════════════════════════════════════════');
  console.log('📈 Daily Treasury Status');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Active Positions: ${treasuryStatus.lpPositions.length}`);
  console.log(`Total Liquidity: ${treasuryStatus.totalLiquidity}`);
  console.log(`Fees Accumulated: ${treasuryStatus.feesAccumulated}`);
  console.log(`24h Agent Volume: ${treasuryStatus.agentVolumeToday}`);
  console.log(`Unique Agents (24h): ${treasuryStatus.uniqueAgentsToday}`);
  console.log(`Daily APY: ${treasuryStatus.dailyAPY.toFixed(2)}%`);
  console.log('═══════════════════════════════════════════════════\n');
}

/**
 * Graceful shutdown
 */
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  swapTracker.stopListening();
  logDailyStatus();
  process.exit(0);
});

// Start the bot
initialize().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
