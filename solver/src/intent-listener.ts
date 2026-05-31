/**
 * Intent Listener — Accepts swap intents and returns ranked routes
 * Queries: EZ-Path (10 venues) + Treasury LP + Direct DEX
 * Returns: Best route by buyAmount / fee ratio
 */

import axios from 'axios';
import { SwapIntent, SolverRoute, ServiceQuote, SolverConfig } from './types';

export class IntentListener {
  private config: SolverConfig;
  private routeCounter: number = 0;

  constructor(config: SolverConfig) {
    this.config = config;
  }

  /**
   * Submit intent and get ranked routes
   */
  async submitIntent(intent: SwapIntent): Promise<SolverRoute[]> {
    console.log(`\n📨 Intent submitted: ${intent.id}`);
    console.log(`   Selling ${intent.sellAmount} of ${intent.sellToken.slice(0, 8)}...`);
    console.log(`   For ${intent.buyToken.slice(0, 8)}...`);

    try {
      // Query all 3 services in parallel
      const [ezPathQuote, treasuryQuote, directQuote] = await Promise.allSettled([
        this.queryEZPath(intent),
        this.queryTreasuryLP(intent),
        this.queryDirectDEX(intent),
      ]);

      // Convert to SolverRoute format
      const routes: SolverRoute[] = [];

      if (ezPathQuote.status === 'fulfilled' && ezPathQuote.value) {
        routes.push(this.quoteToRoute(intent, ezPathQuote.value, 'ez-path'));
      }
      if (treasuryQuote.status === 'fulfilled' && treasuryQuote.value) {
        routes.push(this.quoteToRoute(intent, treasuryQuote.value, 'treasury-lp'));
      }
      if (directQuote.status === 'fulfilled' && directQuote.value) {
        routes.push(this.quoteToRoute(intent, directQuote.value, 'direct-dex'));
      }

      // Filter: only routes that meet minBuyAmount
      const validRoutes = routes.filter((r) => r.buyAmount >= intent.minBuyAmount);

      if (validRoutes.length === 0) {
        console.warn(`   ⚠️  No routes meet minimum buy amount`);
        return [];
      }

      // Rank by: buyAmount (desc), then fee (asc)
      validRoutes.sort((a, b) => {
        const aScore = Number(a.buyAmount) - Number(a.feeAmount);
        const bScore = Number(b.buyAmount) - Number(b.feeAmount);
        return bScore - aScore;
      });

      console.log(`✅ Got ${validRoutes.length} valid routes`);
      validRoutes.forEach((r, i) => {
        console.log(
          `   [${i + 1}] ${r.source.padEnd(12)} → ${r.buyAmount} (fee: ${r.feeAmount})`,
        );
      });

      return validRoutes;
    } catch (error) {
      console.error(`❌ Failed to get routes:`, error);
      return [];
    }
  }

  /**
   * Query EZ-Path for best 10-venue quote
   */
  private async queryEZPath(intent: SwapIntent): Promise<ServiceQuote | null> {
    try {
      const params = new URLSearchParams({
        chain: intent.chain,
        sellToken: intent.sellToken,
        buyToken: intent.buyToken,
        sellAmount: intent.sellAmount.toString(),
      });

      const response = await axios.get(
        `${this.config.ezPathUrl}/api/v1/quote?${params}`,
        { timeout: 5000 },
      );

      if (response.status === 402) {
        // Probe response (no payment yet)
        console.log('   [EZ-Path] Probe: 402 Payment Required');
        return null;
      }

      const { buyAmount, price, sources, settlement_tx } = response.data;

      // Calculate fee: 0.03 USDC for basic (30000 atomic)
      const feeAmount = 30000n; // TODO: Get from tier selection
      const feePercentage = (Number(feeAmount) / Number(intent.sellAmount)) * 100;

      return {
        service: 'ez-path',
        buyAmount: BigInt(buyAmount),
        feeAmount,
        feePercentage,
        executionTime: 2000, // Typical ~2s
        metadata: {
          venues: sources.map((s: any) => s.name),
          price,
          settlement_tx,
        },
      };
    } catch (error) {
      console.log(`   [EZ-Path] Error: ${(error as any).message}`);
      return null;
    }
  }

  /**
   * Query Treasury LP — can it serve this swap?
   */
  private async queryTreasuryLP(intent: SwapIntent): Promise<ServiceQuote | null> {
    try {
      // Treasury LP only serves USDC-WETH on Base
      const isUSDCWETH =
        (intent.sellToken.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' &&
          intent.buyToken.toLowerCase() === '0x4200000000000000000000000000000000000006') ||
        (intent.sellToken.toLowerCase() === '0x4200000000000000000000000000000000000006' &&
          intent.buyToken.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');

      if (!isUSDCWETH || intent.chain !== 'base') {
        return null;
      }

      // For now, estimate: if swap is small (<$10k), Treasury can serve it well
      const estimatedUsdValue = Number(intent.sellAmount) / 1e6; // Rough estimate
      if (estimatedUsdValue > 10000) {
        console.log('   [Treasury LP] Swap too large, skipping');
        return null;
      }

      // Estimate buy amount (simplified: 1:0.0005 ratio for USDC-WETH)
      const estimatedBuyAmount =
        (intent.sellAmount * 5n) / 10000n; // Rough math
      const feeAmount = 0n; // LP earns, doesn't charge extra fee

      return {
        service: 'treasury-lp',
        buyAmount: estimatedBuyAmount,
        feeAmount,
        feePercentage: 0,
        executionTime: 500, // Faster: direct LP swap
        metadata: {
          lpPosition: 'treasury-usdc-weth',
          comment: 'Direct liquidity, no venue aggregation',
        },
      };
    } catch (error) {
      console.log(`   [Treasury LP] Error: ${(error as any).message}`);
      return null;
    }
  }

  /**
   * Query Direct DEX (Uniswap V3 fallback)
   */
  private async queryDirectDEX(intent: SwapIntent): Promise<ServiceQuote | null> {
    try {
      // Only Base for now
      if (intent.chain !== 'base') {
        return null;
      }

      // Estimate via simple ratio (don't actually call DEX to avoid overhead)
      // In production: call Uniswap V3 QuoterV2
      const estimatedBuyAmount = (intent.sellAmount * 4n) / 10000n; // Rough estimate
      const feeAmount = (intent.sellAmount * 5n) / 10000n; // 0.05% fee estimate

      return {
        service: 'direct-dex',
        buyAmount: estimatedBuyAmount,
        feeAmount,
        feePercentage: 0.05,
        executionTime: 1500,
        metadata: {
          dex: 'uniswap-v3',
          comment: 'Direct DEX swap, single venue',
        },
      };
    } catch (error) {
      console.log(`   [Direct DEX] Error: ${(error as any).message}`);
      return null;
    }
  }

  /**
   * Convert ServiceQuote to SolverRoute
   */
  private quoteToRoute(
    intent: SwapIntent,
    quote: ServiceQuote,
    source: 'ez-path' | 'treasury-lp' | 'direct-dex',
  ): SolverRoute {
    const routeId = `route-${++this.routeCounter}`;

    return {
      routeId,
      intentId: intent.id,
      source,
      buyAmount: quote.buyAmount,
      feeAmount: quote.feeAmount,
      feePercentage: quote.feePercentage,
      executionTime: quote.executionTime,
      calldata: quote.calldata,
      slippage: 1.0, // Assume 1% slippage
      metadata: quote.metadata,
    };
  }

  /**
   * Get route by ID
   */
  getRoute(routeId: string): SolverRoute | null {
    // TODO: Implement route cache/storage
    return null;
  }
}
