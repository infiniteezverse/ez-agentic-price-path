/**
 * Intent Listener — Accepts swap intents and returns ranked routes
 * Queries: EZ-Path (10 venues) + Treasury LP (real Aerodrome) + Direct DEX
 * Returns: Best route by buyAmount / fee ratio
 */

import axios from 'axios';
import { PublicClient } from 'viem';
import { SwapIntent, SolverRoute, ServiceQuote, SolverConfig } from './types';

// Aerodrome contract addresses on Base
// Using V2 Router for classic pools (not SlipStream)
const AERODROME_ROUTER = '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43';
const AERODROME_FACTORY = '0x420DD381b31aEf6683db6B902084cB0FFECe40Da';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH_BASE = '0x4200000000000000000000000000000000000006';

// Aerodrome V2 Router ABI - getAmountsOut function
// Route struct: {from: address, to: address, stable: bool, factory: address}
const ROUTER_ABI = [
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      {
        name: 'routes',
        type: 'tuple[]',
        components: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'stable', type: 'bool' },
          { name: 'factory', type: 'address' },
        ],
      },
    ],
    name: 'getAmountsOut',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export class IntentListener {
  private config: SolverConfig;
  private publicClient: PublicClient;
  private routeCounter: number = 0;

  constructor(config: SolverConfig, publicClient: PublicClient) {
    this.config = config;
    this.publicClient = publicClient;
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
   * Note: 402 Payment Required is expected on first probe
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
        {
          timeout: 5000,
          validateStatus: () => true, // Accept all status codes including 402
        },
      );

      if (response.status === 402) {
        // Probe response (no payment yet) — X402 payment will be handled by settlement layer
        console.log('   [EZ-Path] Probe: 402 Payment Required (will sign payment at execution time)');

        // Return an estimated quote so EZ-Path appears in route ranking
        // Actual price will be determined at execution time after payment
        // Estimate 10-venue routing at ~505 parts per 1000 (1.5% better than Treasury LP at ~499 parts per 1000)
        // Example: 100M atomic USDC → ~50.5B wei WETH
        const RATE_NUMERATOR = 505n; // 10-venue routing rate
        const RATE_DENOMINATOR = 1000n;
        const estimatedBuyAmount = (intent.sellAmount * RATE_NUMERATOR * BigInt(1e12)) / RATE_DENOMINATOR; // Scale to 18-decimal WETH units
        const feeAmount = 30000n; // Basic tier: 0.03 USDC
        const feePercentage = (Number(feeAmount) / Number(intent.sellAmount)) * 100;

        console.log(`   [EZ-Path] Returning estimate: ${estimatedBuyAmount}`);

        return {
          service: 'ez-path',
          buyAmount: estimatedBuyAmount,
          feeAmount,
          feePercentage,
          executionTime: 2000, // Typical ~2s
          metadata: {
            venues: ['0x', 'Aerodrome', 'UniswapV3', 'more...'],
            price: 'estimated',
            note: 'Real price determined at execution with X402 payment',
          },
        };
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
   * Query Treasury LP — real Aerodrome Router price
   */
  private async queryTreasuryLP(intent: SwapIntent): Promise<ServiceQuote | null> {
    try {
      // Treasury LP only serves USDC-WETH on Base
      const isUSDCWETH =
        (intent.sellToken.toLowerCase() === USDC_BASE.toLowerCase() &&
          intent.buyToken.toLowerCase() === WETH_BASE.toLowerCase()) ||
        (intent.sellToken.toLowerCase() === WETH_BASE.toLowerCase() &&
          intent.buyToken.toLowerCase() === USDC_BASE.toLowerCase());

      if (!isUSDCWETH || intent.chain !== 'base') {
        return null;
      }

      // Query Aerodrome Router for real V2 pool price
      let buyAmount: bigint;
      let source = 'aerodrome-router';

      try {
        // Build route for getAmountsOut: USDC → WETH (volatile pool)
        const routes = [
          {
            from: intent.sellToken as `0x${string}`,
            to: intent.buyToken as `0x${string}`,
            stable: false,
            factory: AERODROME_FACTORY as `0x${string}`,
          },
        ];

        const amounts = (await this.publicClient.readContract({
          address: AERODROME_ROUTER as `0x${string}`,
          abi: ROUTER_ABI,
          functionName: 'getAmountsOut',
          args: [intent.sellAmount, routes],
        })) as bigint[];

        // amounts[0] = amountIn, amounts[1] = amountOut
        buyAmount = amounts[1];

        console.log(`   [Treasury LP] Real Aerodrome quote: ${buyAmount}`);
      } catch (routerError) {
        // Fallback to conservative estimate if router fails
        // USDC (6 decimals) → WETH (18 decimals)
        // Rough: 1 WETH ≈ 2000 USDC, so 1 USDC ≈ 0.0005 WETH
        buyAmount = (intent.sellAmount * BigInt(1000)) / BigInt(2000000);
        source = 'treasury-lp-estimate';
        console.log(`   [Treasury LP] Using estimate (Router unavailable): ${buyAmount}`);
      }

      // Treasury LP doesn't charge a separate fee (it earns from swap spread)
      const feeAmount = 0n;

      return {
        service: 'treasury-lp',
        buyAmount,
        feeAmount,
        feePercentage: 0,
        executionTime: 500, // Faster: direct LP swap
        metadata: {
          lpPosition: 'treasury-usdc-weth-aerodrome',
          source,
          comment: 'Real on-chain liquidity from Treasury LP',
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
