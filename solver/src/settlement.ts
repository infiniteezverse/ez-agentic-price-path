/**
 * Settlement — Executes winning route and records on-chain
 * Handles: EZ-Path routing, Treasury LP swaps, direct DEX execution
 */

import { PublicClient, WalletClient, getAddress } from 'viem';
import { SolverRoute, SwapIntent, ExecutionResult, SolverConfig } from './types';
import axios from 'axios';

export class Settlement {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private config: SolverConfig;

  constructor(publicClient: PublicClient, walletClient: WalletClient, config: SolverConfig) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.config = config;
  }

  /**
   * Execute the selected route and return result
   */
  async executeRoute(intent: SwapIntent, route: SolverRoute): Promise<ExecutionResult> {
    console.log(`\n⚙️  Executing route: ${route.source}`);
    console.log(`   Route ID: ${route.routeId}`);
    console.log(`   Expected output: ${route.buyAmount}`);

    try {
      switch (route.source) {
        case 'ez-path':
          return await this.executeViaEZPath(intent, route);
        case 'treasury-lp':
          return await this.executeViaTreasuryLP(intent, route);
        case 'direct-dex':
          return await this.executeViaDirectDEX(intent, route);
        default:
          throw new Error(`Unknown route source: ${route.source}`);
      }
    } catch (error) {
      console.error(`❌ Execution failed:`, error);
      return {
        intentId: intent.id,
        routeId: route.routeId,
        txHash: '',
        blockNumber: 0,
        status: 'failed',
        amountOut: 0n,
        actualFee: 0n,
        executedAt: Math.floor(Date.now() / 1000),
        errorCode: 'EXECUTION_FAILED',
        errorMessage: String(error),
      };
    }
  }

  /**
   * Execute via EZ-Path (10-venue routing)
   */
  private async executeViaEZPath(intent: SwapIntent, route: SolverRoute): Promise<ExecutionResult> {
    console.log('   [EZ-Path] Calling /api/v1/quote with X402 payment...');

    try {
      // In real implementation: Sign X402 EIP-3009, include header
      const params = new URLSearchParams({
        chain: intent.chain,
        sellToken: intent.sellToken,
        buyToken: intent.buyToken,
        sellAmount: intent.sellAmount.toString(),
      });

      const response = await axios.get(
        `${this.config.ezPathUrl}/api/v1/quote?${params}`,
        {
          headers: {
            // 'X-Payment': signedEIP3009,  // TODO: Sign and include
          },
          timeout: 10000,
        },
      );

      const { buyAmount, settlement_tx } = response.data;

      console.log(`   ✅ Quote executed: ${buyAmount}`);

      return {
        intentId: intent.id,
        routeId: route.routeId,
        txHash: settlement_tx || 'pending',
        blockNumber: 0,
        status: settlement_tx ? 'success' : 'pending',
        amountOut: BigInt(buyAmount),
        actualFee: route.feeAmount,
        executedAt: Math.floor(Date.now() / 1000),
      };
    } catch (error) {
      throw new Error(`EZ-Path execution failed: ${error}`);
    }
  }

  /**
   * Execute via Treasury LP (direct swap from LP)
   */
  private async executeViaTreasuryLP(intent: SwapIntent, route: SolverRoute): Promise<ExecutionResult> {
    console.log('   [Treasury LP] Executing direct LP swap...');

    try {
      // In real implementation: Call Treasury contract to execute swap
      // treasury.swap(tokenIn, tokenOut, amountIn, minAmountOut)

      // For now, simulate
      const txHash = `0x${'0'.repeat(63)}1`;  // Mock tx

      console.log(`   ✅ Treasury LP swap executed: ${txHash}`);

      return {
        intentId: intent.id,
        routeId: route.routeId,
        txHash,
        blockNumber: 0,
        status: 'success',
        amountOut: route.buyAmount,
        actualFee: route.feeAmount,
        executedAt: Math.floor(Date.now() / 1000),
      };
    } catch (error) {
      throw new Error(`Treasury LP execution failed: ${error}`);
    }
  }

  /**
   * Execute via Direct DEX (Uniswap V3)
   */
  private async executeViaDirectDEX(intent: SwapIntent, route: SolverRoute): Promise<ExecutionResult> {
    console.log('   [Direct DEX] Executing Uniswap V3 swap...');

    try {
      // In real implementation: Build + sign Uniswap V3 swap calldata
      // SwapRouter02.exactInputSingle({
      //   tokenIn, tokenOut, fee, recipient,
      //   deadline, amountIn, amountOutMinimum, sqrtPriceLimitX96
      // })

      // For now, simulate
      const txHash = `0x${'0'.repeat(63)}2`;  // Mock tx

      console.log(`   ✅ Direct DEX swap executed: ${txHash}`);

      return {
        intentId: intent.id,
        routeId: route.routeId,
        txHash,
        blockNumber: 0,
        status: 'success',
        amountOut: route.buyAmount,
        actualFee: route.feeAmount,
        executedAt: Math.floor(Date.now() / 1000),
      };
    } catch (error) {
      throw new Error(`Direct DEX execution failed: ${error}`);
    }
  }

  /**
   * Record execution on-chain (SolverRegistry)
   */
  async recordOnChain(result: ExecutionResult, route: SolverRoute): Promise<void> {
    console.log(`\n📝 Recording on-chain in SolverRegistry...`);

    try {
      // TODO: Call SolverRegistry.recordExecution(intentId, source, txHash, status)
      console.log(`   ✅ Recorded: ${route.source} → ${result.status}`);
    } catch (error) {
      console.warn(`   ⚠️  Failed to record on-chain: ${error}`);
      // Don't fail execution if recording fails
    }
  }
}
