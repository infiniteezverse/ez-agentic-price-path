import { createPublicClient, createWalletClient, http, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  fetchZeroExQuote,
  fetchParaSwapQuote,
  fetchAerodromeQuote,
  fetchUniswapV3Quote,
  tokenDecimals,
  type NormalizedQuote,
} from "./venues";
import { settleThroughFacilitator, type AuthData } from "./facilitator";
import { type IChain, type ChainConfig, type QuoteParams, type SettlementResult, type ExecutionRecord } from "../types";

// FiatToken v2.2 transferWithAuthorization (EIP-3009)
const TRANSFER_WITH_AUTH_ABI = [
  {
    name: "transferWithAuthorization",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

interface Env {
  ZERO_EX_API_KEY: string;
  PARASWAP_API_KEY?: string;
  RELAYER_PRIVATE_KEY?: string;
  CDP_FACILITATOR_URL?: string;
  METERING: KVNamespace;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  BASE_RPC_URL?: string;
}

interface RoutingMetadata {
  execution_mode: "direct" | "concurrent_race" | "emergency_onchain_fallback";
  winner: "0x" | "paraswap" | "aerodrome" | "uniswap_v3_onchain";
  race_comparison?: {
    lane_1_aggregator_out: string;
    lane_2_aerodrome_out: string;
  };
}

export abstract class EVMChain implements IChain {
  protected abstract config: ChainConfig;
  protected env: Env;
  protected kv: KVNamespace;
  protected priceAtomic = "30000"; // 0.03 USDC
  protected tierAtomicResilient = 100000n;
  protected tierAtomicInstitutional = 500000n;

  constructor(env: Env, kv: KVNamespace) {
    this.env = env;
    this.kv = kv;
  }

  getConfig(): ChainConfig {
    return this.config;
  }

  async fetchQuote(params: QuoteParams): Promise<NormalizedQuote> {
    const { sellToken, buyToken, sellAmount, slippagePercentage } = params;

    // Determine tier based on payment value (passed separately in router)
    // For now, default to basic tier
    return this.fetchQuoteBasic(sellToken, buyToken, sellAmount, slippagePercentage);
  }

  private async fetchQuoteBasic(
    sellToken: string,
    buyToken: string,
    sellAmount: string,
    slippagePercentage: string | null,
  ): Promise<NormalizedQuote> {
    return fetchZeroExQuote(
      sellToken,
      buyToken,
      sellAmount,
      this.config.chainId,
      slippagePercentage,
      this.env.ZERO_EX_API_KEY,
    );
  }

  async fetchQuoteResilient(
    sellToken: string,
    buyToken: string,
    sellAmount: string,
    slippagePercentage: string | null,
  ): Promise<{ quote: NormalizedQuote; metadata: RoutingMetadata }> {
    type LaneResult = { quote: NormalizedQuote; engine: string };

    const [lane1Result, lane2Result] = await Promise.allSettled<LaneResult>([
      // Lane 1 — Aggregator stack: 0x → ParaSwap fallback
      (async (): Promise<LaneResult> => {
        try {
          const q = await fetchZeroExQuote(
            sellToken,
            buyToken,
            sellAmount,
            this.config.chainId,
            slippagePercentage,
            this.env.ZERO_EX_API_KEY,
          );
          return { quote: q, engine: "0x" };
        } catch (zeroExErr) {
          const reason = zeroExErr instanceof Error ? zeroExErr.message : String(zeroExErr);
          console.error(`[lane1] 0x failed (${reason}), trying paraswap`);
          const q = await fetchParaSwapQuote(
            sellToken,
            buyToken,
            sellAmount,
            String(this.config.chainId),
            slippagePercentage,
            this.env.PARASWAP_API_KEY,
          );
          return { quote: q, engine: "paraswap" };
        }
      })(),
      // Lane 2 — Aerodrome on-chain
      (async (): Promise<LaneResult> => {
        const q = await fetchAerodromeQuote(
          sellToken,
          buyToken,
          sellAmount,
          this.config.contractAddresses?.["aerodrome"] || "",
          this.config.contractAddresses?.["aerodrome_factory"] || "",
          this.config.rpcUrl,
        );
        return { quote: q, engine: "aerodrome" };
      })(),
    ]);

    if (lane1Result.status === "rejected") console.error(`[lane1] failed: ${lane1Result.reason}`);
    if (lane2Result.status === "rejected") console.error(`[lane2] aerodrome failed: ${lane2Result.reason}`);

    const lane1 = lane1Result.status === "fulfilled" ? lane1Result.value : null;
    const lane2 = lane2Result.status === "fulfilled" ? lane2Result.value : null;

    if (!lane1 && !lane2) {
      throw new Error("all routing engines failed (0x/paraswap/aerodrome)");
    }

    let winner: LaneResult;
    if (!lane1) winner = lane2!;
    else if (!lane2) winner = lane1;
    else winner = BigInt(lane1.quote.buyAmount) >= BigInt(lane2.quote.buyAmount) ? lane1 : lane2;

    const edgeBps =
      lane1 && lane2
        ? Math.round(
            ((BigInt(lane1.quote.buyAmount) > BigInt(lane2.quote.buyAmount)
              ? BigInt(lane1.quote.buyAmount) - BigInt(lane2.quote.buyAmount)
              : BigInt(lane2.quote.buyAmount) - BigInt(lane1.quote.buyAmount)) *
              10000n) /
              (lane1.quote.buyAmount < lane2.quote.buyAmount ? BigInt(lane1.quote.buyAmount) : BigInt(lane2.quote.buyAmount))
          )
        : undefined;

    return {
      quote: winner.quote,
      metadata: {
        execution_mode: "concurrent_race",
        winner: winner.engine as RoutingMetadata["winner"],
        race_comparison: {
          lane_1_aggregator_out: lane1?.quote.buyAmount ?? "0",
          lane_2_aerodrome_out: lane2?.quote.buyAmount ?? "0",
        },
      },
    };
  }

  async fetchQuoteInstitutional(
    sellToken: string,
    buyToken: string,
    sellAmount: string,
    slippagePercentage: string | null,
  ): Promise<{ quote: NormalizedQuote; metadata: RoutingMetadata }> {
    // Try resilient race first
    const resilientResult = await this.fetchQuoteResilient(sellToken, buyToken, sellAmount, slippagePercentage);

    // If resilient succeeds, return it
    if (resilientResult.quote.buyAmount !== "0") {
      return resilientResult;
    }

    // Fallback: try Uniswap V3
    console.error("[routing] both lanes failed — activating institutional uniswap v3 safety net");
    const quote = await fetchUniswapV3Quote(
      sellToken,
      buyToken,
      sellAmount,
      this.config.contractAddresses?.["uniswap_v3"] || "",
      this.config.rpcUrl,
    );

    return {
      quote,
      metadata: {
        execution_mode: "emergency_onchain_fallback",
        winner: "uniswap_v3_onchain",
        race_comparison: { lane_1_aggregator_out: "0", lane_2_aerodrome_out: "0" },
      },
    };
  }

  async settle(auth: AuthData, sig: string): Promise<SettlementResult> {
    let settlementTx: string | null = null;
    const facilitatorUrl = this.env.CDP_FACILITATOR_URL ?? "https://x402.org/facilitator";

    // Try facilitator first (Bazaar indexing)
    let facilitatorSucceeded = false;
    try {
      settlementTx = await settleThroughFacilitator(
        auth,
        sig,
        facilitatorUrl,
        "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad", // toll address (hardcoded for now)
        this.config.paymentToken,
      );
      facilitatorSucceeded = true;
      const ttl = Math.max(1, Number(BigInt(auth.validBefore) - BigInt(Math.floor(Date.now() / 1000))));
      await this.kv.put(`nonce:${auth.nonce}`, settlementTx ?? "facilitator", { expirationTtl: ttl });
      console.log(`[settlement] facilitator tx=${settlementTx} payer=${auth.from}`);
    } catch (facilitatorErr) {
      console.error(
        `[settlement] facilitator failed (${facilitatorErr instanceof Error ? facilitatorErr.message : facilitatorErr}), falling back to relayer`
      );
    }

    if (!facilitatorSucceeded) {
      try {
        settlementTx = await this.settlePayment(auth, sig);
      } catch (err) {
        console.error(`[settlement] FAILED payer=${auth.from} nonce=${auth.nonce} error=${err instanceof Error ? err.message : err}`);
        return { txHash: null, status: "failed", errorCode: "settlement_failed" };
      }
    }

    return { txHash: settlementTx, status: "success" };
  }

  private async settlePayment(auth: AuthData, sig: string): Promise<string | null> {
    if (!this.env.RELAYER_PRIVATE_KEY) return null;

    const r = sig.slice(0, 66) as `0x${string}`;
    const s = `0x${sig.slice(66, 130)}` as `0x${string}`;
    const v = parseInt(sig.slice(130, 132), 16);

    const account = privateKeyToAccount(this.env.RELAYER_PRIVATE_KEY as `0x${string}`);
    const client = createWalletClient({
      account,
      chain: this.config.viemChain,
      transport: http(this.config.rpcUrl),
    });

    const hash = await client.writeContract({
      address: this.config.paymentToken as `0x${string}`,
      abi: TRANSFER_WITH_AUTH_ABI,
      functionName: "transferWithAuthorization",
      args: [
        auth.from as `0x${string}`,
        auth.to as `0x${string}`,
        BigInt(auth.value),
        BigInt(auth.validAfter),
        BigInt(auth.validBefore),
        auth.nonce as `0x${string}`,
        v,
        r,
        s,
      ],
    });

    const ttl = Math.max(1, Number(BigInt(auth.validBefore) - BigInt(Math.floor(Date.now() / 1000))));
    await this.kv.put(`nonce:${auth.nonce}`, hash, { expirationTtl: ttl });

    console.log(`[settlement] submitted tx=${hash} payer=${auth.from} nonce=${auth.nonce}`);
    return hash;
  }

  async recordMetrics(record: ExecutionRecord): Promise<void> {
    const date = new Date().toISOString().split("T")[0];

    // ── Operator Metrics (chain-level aggregates) ──
    const operatorKey = `metrics:operator:${record.chain}:${date}`;
    const operatorRaw = await this.kv.get(operatorKey);
    const operatorData = operatorRaw ? JSON.parse(operatorRaw) : {
      request_count: 0,
      total_revenue_atomic: 0,
      latency_sum_ms: 0,
      settlement_success_count: 0,
      fallback_count: 0,
      error_breakdown: {},
      venue_summary: {},
    };

    // Merge new request
    operatorData.request_count += 1;
    operatorData.total_revenue_atomic += record.feeCollected.atomic;
    operatorData.latency_sum_ms += record.totalLatencyMs;
    if (record.settlement.status === "success") operatorData.settlement_success_count += 1;
    if (record.fallbackUsed) operatorData.fallback_count += 1;
    if (record.errorClassification) {
      operatorData.error_breakdown[record.errorClassification] = (operatorData.error_breakdown[record.errorClassification] || 0) + 1;
    }

    // Track per-venue performance
    for (const venue of record.venues) {
      if (!operatorData.venue_summary[venue.name]) {
        operatorData.venue_summary[venue.name] = { request_count: 0, win_count: 0, latency_sum_ms: 0, success_count: 0 };
      }
      operatorData.venue_summary[venue.name].request_count += 1;
      operatorData.venue_summary[venue.name].latency_sum_ms += venue.latencyMs;
      if (venue.success) operatorData.venue_summary[venue.name].success_count += 1;
      if (venue.name === record.execution.winner) {
        operatorData.venue_summary[venue.name].win_count += 1;
      }
    }

    // Compute derived metrics
    operatorData.avg_latency_ms = operatorData.request_count > 0 ? operatorData.latency_sum_ms / operatorData.request_count : 0;
    operatorData.settlement_success_rate = operatorData.request_count > 0 ? (operatorData.settlement_success_count / operatorData.request_count) * 100 : 0;

    // Compute per-venue derived metrics
    for (const [venueName, venueData] of Object.entries(operatorData.venue_summary)) {
      const v = venueData as any;
      v.avg_latency_ms = v.request_count > 0 ? v.latency_sum_ms / v.request_count : 0;
      v.win_rate = v.request_count > 0 ? (v.win_count / v.request_count) * 100 : 0;
      v.success_rate = v.request_count > 0 ? (v.success_count / v.request_count) * 100 : 0;
    }

    await this.kv.put(operatorKey, JSON.stringify(operatorData), { expirationTtl: 86400 });

    // ── Venue-Level Metrics ──
    for (const venue of record.venues) {
      const venueKey = `metrics:operator:venue:${record.chain}:${venue.name}:${date}`;
      const venueRaw = await this.kv.get(venueKey);
      const venueData = venueRaw ? JSON.parse(venueRaw) : {
        request_count: 0,
        win_count: 0,
        latency_sum_ms: 0,
        success_count: 0,
      };

      venueData.request_count += 1;
      venueData.latency_sum_ms += venue.latencyMs;
      if (venue.success) venueData.success_count += 1;
      if (venue.name === record.execution.winner) venueData.win_count += 1;

      venueData.avg_latency_ms = venueData.request_count > 0 ? venueData.latency_sum_ms / venueData.request_count : 0;
      venueData.win_rate = venueData.request_count > 0 ? (venueData.win_count / venueData.request_count) * 100 : 0;
      venueData.success_rate = venueData.request_count > 0 ? (venueData.success_count / venueData.request_count) * 100 : 0;

      await this.kv.put(venueKey, JSON.stringify(venueData), { expirationTtl: 86400 });
    }

    // ── Agent Metrics (payer-scoped) ──
    const agentKey = `metrics:agent:${record.chain}:${record.payer}:${date}`;
    const agentRaw = await this.kv.get(agentKey);
    const agentData = agentRaw ? JSON.parse(agentRaw) : {
      request_count: 0,
      total_fees_atomic: 0,
      latency_sum_ms: 0,
      edge_bps_sum: 0,
      success_count: 0,
      tier_breakdown: { basic: 0, resilient: 0, institutional: 0 },
      routing_engine_usage: {},
    };

    agentData.request_count += 1;
    agentData.total_fees_atomic += record.feeCollected.atomic;
    agentData.latency_sum_ms += record.totalLatencyMs;
    agentData.edge_bps_sum += record.edgeBps || 0;
    if (record.settlement.status === "success") agentData.success_count += 1;
    agentData.tier_breakdown[record.tier] += 1;
    agentData.routing_engine_usage[record.execution.winner] = (agentData.routing_engine_usage[record.execution.winner] || 0) + 1;

    // Compute derived metrics
    agentData.avg_latency_ms = agentData.request_count > 0 ? agentData.latency_sum_ms / agentData.request_count : 0;
    agentData.avg_edge_bps = agentData.request_count > 0 ? agentData.edge_bps_sum / agentData.request_count : 0;
    agentData.success_rate = agentData.request_count > 0 ? (agentData.success_count / agentData.request_count) * 100 : 0;

    await this.kv.put(agentKey, JSON.stringify(agentData), { expirationTtl: 86400 });

    // ── Fallback Log ──
    if (record.fallbackUsed) {
      const fallbackKey = `fallback_log:${record.chain}:${date}`;
      const fallbackRaw = await this.kv.get(fallbackKey);
      const fallbackData = fallbackRaw ? JSON.parse(fallbackRaw) : {
        total_fallback_events: 0,
        reasons: {},
        extra_latency_sum_ms: 0,
      };

      fallbackData.total_fallback_events += 1;
      const reason = record.errorClassification || "unknown";
      fallbackData.reasons[reason] = (fallbackData.reasons[reason] || 0) + 1;
      fallbackData.extra_latency_sum_ms += record.totalLatencyMs;

      fallbackData.avg_extra_latency_ms = fallbackData.total_fallback_events > 0 ? fallbackData.extra_latency_sum_ms / fallbackData.total_fallback_events : 0;

      await this.kv.put(fallbackKey, JSON.stringify(fallbackData), { expirationTtl: 86400 });
    }

    // ── Supabase Cold Storage (async, non-blocking) ──
    if (this.env.SUPABASE_URL && this.env.SUPABASE_SERVICE_ROLE_KEY) {
      await fetch(`${this.env.SUPABASE_URL}/rest/v1/execution_records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "apikey": this.env.SUPABASE_SERVICE_ROLE_KEY,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          request_id: record.requestId,
          timestamp: new Date(record.timestamp).toISOString(),
          chain: record.chain,
          payer: record.payer,
          tier: record.tier,
          fee_atomic: record.feeCollected.atomic,
          fee_usd: parseFloat(record.feeCollected.usdValue.replace("$", "")),
          relayer_cost_gas: record.relayerCost?.gasSpent,
          relayer_cost_usd: record.relayerCost?.dollarEstimate ? parseFloat(record.relayerCost.dollarEstimate.replace("$", "")) : null,
          net_margin_usd: record.netMargin ? parseFloat(record.netMargin.replace("$", "")) : null,
          execution_mode: record.execution.mode,
          winner: record.execution.winner,
          total_latency_ms: record.totalLatencyMs,
          venues: JSON.stringify(record.venues),
          edge_bps: record.edgeBps || null,
          settlement_attempted: record.settlement.attempted,
          settlement_status: record.settlement.status,
          settlement_tx: record.settlement.txHash,
          settlement_error: record.settlement.errorCode,
          fallback_used: record.fallbackUsed || false,
          mev_flags: record.mevFlags,
          error_classification: record.errorClassification,
        }),
      }).catch(err => {
        console.error(`[supabase] failed to write execution record: ${err instanceof Error ? err.message : err}`);
      });
    }
  }
}
