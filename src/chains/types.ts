// ─── Chain Abstraction Types ────────────────────────────────────────────────

export type SupportedChain = "base" | "solana" | "arbitrum" | "optimism" | "polygon";

export interface ChainConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  rpcUrls?: string[]; // fallback RPC URLs for settlement resilience
  paymentToken: string;
  decimals: number;
  viemChain: any; // viem chain object (null for Solana)
  venues: string[];
  contractAddresses?: Record<string, string>; // venue-specific contract addresses
}

export interface NormalizedQuote {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  sources: Array<{ name: string; proportion: string }>;
}

export interface QuoteParams {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  slippagePercentage?: string;
}

export interface SettlementResult {
  txHash: string | null;
  status: "success" | "failed" | "pending";
  gasCost?: string;
  errorCode?: string;
}

export interface ExecutionRecord {
  // Identity & Context
  requestId: string;
  timestamp: number;
  chain: SupportedChain;
  payer: string;
  tier: "basic" | "resilient" | "institutional";

  // Financial Metrics
  feeCollected: {
    atomic: number;
    usdValue: string;
  };
  relayerCost?: {
    gasSpent: string;
    dollarEstimate: string;
  };
  netMargin?: string;

  // Performance Telemetry
  execution: {
    mode: "direct" | "concurrent_race" | "emergency_fallback";
    winner: string;
    buyAmount: string;
  };
  venues: Array<{
    name: string;
    latencyMs: number;
    buyAmount: string;
    success: boolean;
    error?: string;
  }>;
  edgeBps?: number;
  totalLatencyMs: number;

  // Security & Health
  auth: {
    verificationStatus: "valid" | "invalid" | "error";
    invalidReason?: string;
  };
  settlement: {
    attempted: boolean;
    status: "pending" | "success" | "failed";
    txHash?: string;
    errorCode?: string;
  };
  rateLimitStatus: {
    category: "probe" | "invalid" | "paid";
    allowed: boolean;
    remainingQuotaMs?: number;
  };

  // Operational Flags
  mevFlags?: string[];
  fallbackUsed?: boolean;
  errorClassification?: string;
}

export interface IChain {
  fetchQuote(params: QuoteParams): Promise<NormalizedQuote>;
  settle(auth: any, sig: string): Promise<SettlementResult>;
  recordMetrics(record: ExecutionRecord): Promise<void>;
  getConfig(): ChainConfig;
}
