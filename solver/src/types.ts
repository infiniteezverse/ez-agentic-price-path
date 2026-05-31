/**
 * EZ-Path Solver Types
 * Intent-based routing between EZ-Path, Treasury LP, and direct DEX
 */

export interface SwapIntent {
  id: string;                    // Unique intent ID
  sellToken: string;             // Token address to sell
  buyToken: string;              // Token address to buy
  sellAmount: bigint;            // Amount in base decimals
  minBuyAmount: bigint;          // Minimum acceptable output
  solver?: string;               // Optional: request specific solver
  deadline: number;              // Unix timestamp
  nonce: string;                 // For replay protection
  chain: string;                 // "base" | "arbitrum" | "optimism" | "polygon"
}

export interface SolverRoute {
  routeId: string;
  intentId: string;
  source: 'ez-path' | 'treasury-lp' | 'direct-dex';
  buyAmount: bigint;             // Amount agent will receive
  feeAmount: bigint;             // Fee in sell token
  feePercentage: number;         // Fee as %
  executionTime: number;         // Estimated time in ms
  calldata?: string;             // Raw calldata for execution
  contract?: string;             // Contract to call
  slippage: number;              // Expected slippage %
  gasEstimate?: bigint;          // Estimated gas in wei
  metadata: {
    venues?: string[];           // If from EZ-Path: which venues won
    lpPosition?: string;         // If from Treasury: which position
    dex?: string;                // If direct: which DEX
  };
}

export interface ExecutionResult {
  intentId: string;
  routeId: string;
  txHash: string;
  blockNumber: number;
  status: 'success' | 'failed' | 'pending';
  amountOut: bigint;
  actualFee: bigint;
  executedAt: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface IntentSubmission {
  intent: SwapIntent;
  routes: SolverRoute[];
  selectedRoute: SolverRoute;
  executed: ExecutionResult;
}

export interface SolverMetrics {
  timestamp: number;
  totalIntents: number;
  executedIntents: number;
  failedIntents: number;
  routeDistribution: {
    ez_path: number;
    treasury_lp: number;
    direct_dex: number;
  };
  avgExecutionTime: number;
  avgSlippage: number;
  totalVolume: bigint;
  totalFeesCaptured: bigint;
}

export interface SolverConfig {
  chainId: number;
  rpcUrl: string;

  // Service endpoints
  ezPathUrl: string;             // "https://ezpath.myezverse.xyz"
  treasuryLpAddress: string;     // Treasury LP contract
  treasuryRegistryAddress: string; // Treasury metrics contract

  // Solver contract
  solverRegistryAddress: string;
  solverPrivateKey: string;

  // Express server
  port: number;
  host: string;
}

export interface ServiceQuote {
  service: 'ez-path' | 'treasury-lp' | 'direct-dex';
  buyAmount: bigint;
  feeAmount: bigint;
  feePercentage: number;
  executionTime: number;
  calldata?: string;
  metadata: Record<string, any>;
}

export interface SolverState {
  activeIntents: Map<string, SwapIntent>;
  completedIntents: IntentSubmission[];
  metrics: SolverMetrics;
  lastUpdated: number;
}
