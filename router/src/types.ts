/**
 * EZ-Path Open Router Types
 * Public-facing route aggregator combining Phase 1 + 2
 */

export interface RouteRequest {
  chain: string;
  sellToken: string;
  buyToken: string;
  sellAmount: bigint;
  slippagePercentage?: number;
  userAddress?: string;
}

export interface RouteOption {
  routeId: string;
  source: 'ez-path' | 'treasury-lp' | 'direct-dex';
  buyAmount: bigint;
  price: string;
  priceImpact: number;
  feeAmount: bigint;
  feePercentage: number;
  executionTime: number;
  gasEstimate?: bigint;
  slippage: number;
  metadata: Record<string, any>;
}

export interface BestRoute {
  route: RouteOption;
  feeBreakdown: {
    x402_fee?: bigint;
    solver_fee?: bigint;
    lp_fee?: bigint;
    dex_fee?: bigint;
  };
  totalValueLocked?: bigint;
  liquidity?: {
    source: string;
    depth: bigint;
  };
}

export interface RouterMetrics {
  timestamp: number;
  totalRoutes: number;
  uniqueUsers: number;
  totalVolume: bigint;
  avgExecutionTime: number;
  sourceDistribution: {
    ez_path: number;
    treasury_lp: number;
    direct_dex: number;
  };
}

export interface RouterConfig {
  port: number;
  host: string;
  ezPathUrl: string;
  solverUrl: string;
  treasuryUrl?: string;
  rpcUrl: string;
}
