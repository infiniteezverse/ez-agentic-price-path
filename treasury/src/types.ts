/**
 * EZ-Path Treasury Types
 * Shared types across LP Manager, Swap Tracker, and Metrics
 */

export interface LPPosition {
  tokenId: string;           // Aerodrome V3 NFT position ID
  pool: string;              // Pool address (USDC-WETH)
  lowerTick: number;         // Lower price tick
  upperTick: number;         // Upper price tick
  liquidity: bigint;         // Liquidity amount
  token0: string;            // USDC
  token1: string;            // WETH
  owner: string;             // Treasury address
  createdAtBlock: number;
  createdAtTimestamp: number;
}

export interface TrackedSwap {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  swapper: string;           // Address performing swap
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
  poolAddress: string;
  hitYourLP: boolean;        // Did swap route through your position?
  feeEarned?: bigint;        // 0.01% of swap amount
  gasCost?: bigint;          // Gas cost of the swap
}

export interface HourlyMetrics {
  timestamp: number;
  periodStartMs: number;
  periodEndMs: number;

  // Swap volume
  totalSwaps: number;
  totalVolumeUSDC: bigint;
  totalVolumePairs: {
    [pair: string]: bigint;  // "USDC-WETH" -> volume
  };

  // Fee tracking
  feesEarned: bigint;        // USDC equivalent
  feeBreakdown: {
    swap_fees: bigint;       // From swaps hitting your LP
    rebalance_costs?: bigint;
  };

  // Agent activity
  uniqueSwappers: number;
  topSwappers: Array<{
    address: string;
    volume: bigint;
    swapCount: number;
  }>;

  // Performance
  avgSwapSize: bigint;
  largestSwap: bigint;
  APY: number;               // Annualized from this hour
}

export interface TreasuryStatus {
  lpPositions: LPPosition[];
  totalLiquidity: bigint;
  feesAccumulated: bigint;
  dailyAPY: number;
  agentVolumeToday: bigint;
  uniqueAgentsToday: number;
  lastUpdated: number;
  health: {
    isRebalanceNeeded: boolean;
    reason?: string;
  };
}

export interface DuneMetric {
  timestamp: number;
  totalSwaps: number;
  totalVolume: bigint;
  feesEarned: bigint;
  uniqueAgents: number;
  routing: {
    ez_path_routed?: number;
    direct_dex: number;
    other?: number;
  };
  lp_stats: {
    positions_active: number;
    total_liquidity: bigint;
    range_lower: number;
    range_upper: number;
  };
}

export interface AerodromePool {
  address: string;
  token0: string;            // USDC
  token1: string;            // WETH
  fee: number;               // 0.01 = 0.01%
  tickSpacing: number;
  sqrtPriceX96: bigint;
  tick: number;
  liquidity: bigint;
}

export interface AerodromePair {
  pool: AerodromePool;
  token0Name: string;
  token1Name: string;
  reserveToken0: bigint;
  reserveToken1: bigint;
}

export interface MintPositionParams {
  token0: string;
  token1: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
  amount0Desired: bigint;
  amount1Desired: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  recipient: string;
  deadline: number;
}

export interface RebalanceAction {
  action: 'burn' | 'mint' | 'collect_fees' | 'none';
  reason: string;
  estimatedGasCost: bigint;
  position?: LPPosition;
}

export type NetworkConfig = {
  chainId: number;
  rpcUrl: string;
  aerodromeRouter: string;
  aerodromePositionManager: string;
  aerodromeFactory: string;
  usdc: string;
  weth: string;
  treasuryAddress: string;
  relayerPrivateKey: string;
};
