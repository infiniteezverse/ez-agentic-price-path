import { type IChain, type ChainConfig, type QuoteParams, type NormalizedQuote, type SettlementResult, type ExecutionRecord } from "../types";

export class SolanaChain implements IChain {
  private solanaConfig: ChainConfig = {
    name: "Solana",
    chainId: 501,
    rpcUrl: "https://api.mainnet-beta.solana.com",
    paymentToken: "EPjFWaLb3odcccccccccccccccccccccccccccccc", // USDC SPL
    decimals: 6,
    viemChain: null,
    venues: ["jupiter", "orca", "raydium"],
  };

  async fetchQuote(_params: QuoteParams): Promise<NormalizedQuote> {
    throw new Error("Solana quote execution not yet implemented");
  }

  async settle(_auth: any, _sig: string): Promise<SettlementResult> {
    return {
      txHash: null,
      status: "failed",
      errorCode: "not_implemented",
    };
  }

  async recordMetrics(record: ExecutionRecord): Promise<void> {
    // Record to operator metrics (separate Solana bucket)
    console.log(`[metrics] Solana request: ${record.requestId} from ${record.payer}`);
  }

  getConfig(): ChainConfig {
    return this.solanaConfig;
  }
}
