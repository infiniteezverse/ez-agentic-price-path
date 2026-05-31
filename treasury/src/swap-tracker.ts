/**
 * Swap Tracker — Listens to Aerodrome pool events and tracks swaps
 * Records which swaps hit your LP position and calculates fees earned
 */

import { PublicClient, getAddress } from 'viem';
import { TrackedSwap, HourlyMetrics, NetworkConfig } from './types';

const AERODROME_POOL_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'sender', type: 'address' },
      { indexed: false, name: 'amount0', type: 'int256' },
      { indexed: false, name: 'amount1', type: 'int256' },
      { indexed: false, name: 'sqrtPriceX96', type: 'uint160' },
      { indexed: false, name: 'liquidity', type: 'uint128' },
      { indexed: false, name: 'tick', type: 'int24' },
    ],
    name: 'Swap',
    type: 'event',
  },
];

export class SwapTracker {
  private publicClient: PublicClient;
  private config: NetworkConfig;
  private swaps: Map<string, TrackedSwap> = new Map();
  private hourlyMetrics: Map<number, HourlyMetrics> = new Map();
  private isListening: boolean = false;
  private unwatch: (() => void) | null = null;

  constructor(publicClient: PublicClient, config: NetworkConfig) {
    this.publicClient = publicClient;
    this.config = config;
  }

  /**
   * Start listening to Aerodrome pool swap events
   */
  async startListening(poolAddress?: string): Promise<void> {
    const pool = poolAddress || this.config.aerodromeRouter;
    console.log(`\n👂 Starting swap tracker on pool ${pool}...`);

    // Watch for Swap events
    this.unwatch = this.publicClient.watchContractEvent({
      address: getAddress(pool),
      abi: AERODROME_POOL_ABI,
      eventName: 'Swap',
      onLogs: (logs) => {
        logs.forEach((log) => {
          this.processSwapEvent(log);
        });
      },
      poll: 1000,  // Poll every 1s
    });

    this.isListening = true;
    console.log(`✅ Swap tracker listening...`);
  }

  /**
   * Stop listening
   */
  stopListening(): void {
    if (this.unwatch) {
      this.unwatch();
      this.isListening = false;
      console.log('🛑 Swap tracker stopped');
    }
  }

  /**
   * Process a single swap event
   */
  private processSwapEvent(log: any): void {
    const {
      transactionHash,
      blockNumber,
      args: { sender, amount0, amount1, sqrtPriceX96, liquidity, tick },
    } = log;

    const swap: TrackedSwap = {
      txHash: transactionHash,
      blockNumber,
      timestamp: Math.floor(Date.now() / 1000),
      swapper: sender,
      tokenIn: amount0 < 0 ? this.config.usdc : this.config.weth,
      tokenOut: amount0 < 0 ? this.config.weth : this.config.usdc,
      amountIn: BigInt(Math.abs(Number(amount0 > 0 ? amount0 : amount1))),
      amountOut: BigInt(Math.abs(Number(amount0 > 0 ? amount1 : amount0))),
      poolAddress: log.address,
      hitYourLP: this.checkIfHitYourLP(tick),
      feeEarned: this.calculateFeeEarned(amount0, amount1),
    };

    this.swaps.set(transactionHash, swap);

    if (swap.hitYourLP) {
      console.log(
        `✨ Agent swap detected: ${swap.swapper.slice(0, 6)}... swapped ${swap.amountIn} for ${swap.amountOut}`,
      );
      console.log(`   Fee earned: ${swap.feeEarned} (0.01%)`);
    }
  }

  /**
   * Check if swap hit your LP position
   * (Simplified: assume position is in range if tick is within bounds)
   */
  private checkIfHitYourLP(tick: number): boolean {
    // TODO: Get actual position tick bounds from LPManager
    const lowerTick = -887200;
    const upperTick = 887200;
    return tick >= lowerTick && tick <= upperTick;
  }

  /**
   * Calculate fee earned (0.01% of swap volume)
   */
  private calculateFeeEarned(amount0: bigint, amount1: bigint): bigint {
    const volume = BigInt(Math.abs(Number(amount0)) + Math.abs(Number(amount1)));
    return (volume * 1n) / 10000n;  // 0.01% fee
  }

  /**
   * Get metrics for a time period
   */
  async getMetrics(startTime: number, endTime: number): Promise<HourlyMetrics> {
    const swapsInPeriod = Array.from(this.swaps.values()).filter(
      (s) => s.timestamp >= startTime && s.timestamp <= endTime,
    );

    const totalVolumeUSDC = swapsInPeriod.reduce((acc, s) => {
      // Approximate: treat all as USDC volume
      return acc + s.amountIn;
    }, 0n);

    const totalFeesEarned = swapsInPeriod
      .filter((s) => s.hitYourLP)
      .reduce((acc, s) => acc + (s.feeEarned || 0n), 0n);

    const uniqueSwappers = new Set(swapsInPeriod.map((s) => s.swapper)).size;

    const topSwappersMap = new Map<string, { volume: bigint; count: number }>();
    swapsInPeriod.forEach((s) => {
      const current = topSwappersMap.get(s.swapper) || { volume: 0n, count: 0 };
      topSwappersMap.set(s.swapper, {
        volume: current.volume + s.amountIn,
        count: current.count + 1,
      });
    });

    const topSwappers = Array.from(topSwappersMap.entries())
      .map(([address, { volume, count }]) => ({ address, volume, swapCount: count }))
      .sort((a, b) => Number(b.volume - a.volume))
      .slice(0, 10);

    const avgSwapSize =
      swapsInPeriod.length > 0 ? totalVolumeUSDC / BigInt(swapsInPeriod.length) : 0n;
    const largestSwap =
      swapsInPeriod.length > 0 ? BigInt(Math.max(...swapsInPeriod.map((s) => Number(s.amountIn)))) : 0n;

    const periodDurationHours = (endTime - startTime) / 3600;
    const dailyVolume = (totalVolumeUSDC / BigInt(periodDurationHours)) * 24n;
    const annualVolume = (dailyVolume * 365n) / BigInt(this.config.usdc === this.config.usdc ? 1 : 1);
    const APY = annualVolume > 0n ? Number((totalFeesEarned * 365n) / annualVolume) : 0;

    return {
      timestamp: endTime,
      periodStartMs: startTime * 1000,
      periodEndMs: endTime * 1000,
      totalSwaps: swapsInPeriod.length,
      totalVolumeUSDC,
      totalVolumePairs: {
        'USDC-WETH': totalVolumeUSDC,  // Simplified
      },
      feesEarned: totalFeesEarned,
      feeBreakdown: {
        swap_fees: totalFeesEarned,
      },
      uniqueSwappers,
      topSwappers,
      avgSwapSize,
      largestSwap,
      APY,
    };
  }

  /**
   * Get all tracked swaps
   */
  getAllSwaps(): TrackedSwap[] {
    return Array.from(this.swaps.values());
  }

  /**
   * Get swaps from last N hours
   */
  getRecentSwaps(hoursBack: number): TrackedSwap[] {
    const cutoff = Math.floor(Date.now() / 1000) - hoursBack * 3600;
    return Array.from(this.swaps.values()).filter((s) => s.timestamp >= cutoff);
  }

  /**
   * Export metrics in Dune-friendly format
   */
  exportForDune(metrics: HourlyMetrics): Record<string, any> {
    return {
      timestamp: new Date(metrics.timestamp * 1000).toISOString(),
      total_swaps: metrics.totalSwaps,
      total_volume_usdc: metrics.totalVolumeUSDC.toString(),
      fees_earned_usdc: metrics.feesEarned.toString(),
      unique_swappers: metrics.uniqueSwappers,
      avg_swap_size: metrics.avgSwapSize.toString(),
      apy: metrics.APY.toFixed(4),
      top_swappers: metrics.topSwappers.slice(0, 5).map((s) => ({
        address: s.address,
        volume: s.volume.toString(),
        swap_count: s.swapCount,
      })),
    };
  }
}
