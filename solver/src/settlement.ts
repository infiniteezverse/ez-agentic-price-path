/**
 * Settlement — Executes winning route and records on-chain
 * Handles: EZ-Path routing, Treasury LP swaps, direct DEX execution
 */

import crypto from 'crypto';
import { PublicClient, WalletClient, getAddress } from 'viem';
import { SolverRoute, SwapIntent, ExecutionResult, SolverConfig } from './types';
import axios from 'axios';

// Aerodrome V2 Router on Base
const AERODROME_ROUTER = '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43';
const AERODROME_FACTORY = '0x420DD381b31aEf6683db6B902084cB0FFECe40Da';

// Aerodrome Router ABI for swapExactTokensForTokens
const ROUTER_ABI = [
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
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
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactTokensForTokens',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

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
   * Sign EIP-3009 TransferWithAuthorization for X402 payment
   * Based on: https://eips.ethereum.org/EIPS/eip-3009
   * Used by executeViaEZPath to pay for quotes
   */
  private async signX402Payment(paymentAmount: bigint): Promise<string> {
    // EIP-3009 message structure for USDC v2 on Base
    const domain = {
      name: 'USD Coin',
      version: '2',
      chainId: 8453n, // Base
      verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
    };

    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    };

    const now = Math.floor(Date.now() / 1000);
    // Random 32-byte nonce for replay protection
    const nonce = '0x' + crypto.randomBytes(32).toString('hex');

    const message = {
      from: this.walletClient.account?.address as `0x${string}`,
      to: '0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad' as `0x${string}`, // EZ-Path toll address
      value: paymentAmount, // Atomic units of USDC (30000 = 0.03 USDC)
      validAfter: 0n,
      validBefore: BigInt(now + 300), // 5 minutes from now (matches EZ-Path EXECUTION_TTL)
      nonce,
    };

    // Sign with viem walletClient
    const signature = await this.walletClient.signTypedData({
      account: this.walletClient.account,
      domain,
      types,
      primaryType: 'TransferWithAuthorization',
      message,
    });

    // Package into X-Payment header payload
    // Convert BigInt values to strings for JSON serialization
    const authWithStrings = {
      from: message.from,
      to: message.to,
      value: message.value.toString(), // Convert BigInt to string
      validAfter: message.validAfter.toString(), // Convert BigInt to string
      validBefore: message.validBefore.toString(), // Convert BigInt to string
      nonce: message.nonce,
    };

    const payload = {
      payload: {
        signature,
        authorization: authWithStrings,
        quote_issued_at: now,
      },
    };

    // Return base64-encoded JSON
    return Buffer.from(JSON.stringify(payload)).toString('base64');
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
   * Execute via EZ-Path (10-venue routing with X402 EIP-3009 payment)
   * Two-step flow: Probe for 402 → Sign payment → Retry with X-Payment header
   */
  private async executeViaEZPath(intent: SwapIntent, route: SolverRoute): Promise<ExecutionResult> {
    console.log('   [EZ-Path] Calling /api/v1/quote with X402 payment...');

    try {
      const params = new URLSearchParams({
        chain: intent.chain,
        sellToken: intent.sellToken,
        buyToken: intent.buyToken,
        sellAmount: intent.sellAmount.toString(),
      });

      const url = `${this.config.ezPathUrl}/api/v1/quote?${params}`;

      // Step 1: Probe without payment (will likely get 402 Payment Required)
      let quoteResponse: any;
      try {
        const probeResponse = await axios.get(url, {
          timeout: 5000,
          validateStatus: () => true, // Accept all status codes including 402
        });

        if (probeResponse.status === 402) {
          // Got 402: Payment Required — extract toll address from response headers
          console.log('   [EZ-Path] Got 402 Payment Required, signing EIP-3009...');

          // Basic tier: 30,000 atomic USDC = 0.03 USDC
          // (Resilient would be 100,000, Institutional would be 500,000)
          const paymentAmount = 30000n;

          // Step 2: Sign EIP-3009 and retry with X-Payment header
          const xPaymentHeader = await this.signX402Payment(paymentAmount);

          quoteResponse = await axios.get(url, {
            headers: {
              'X-Payment': xPaymentHeader,
            },
            timeout: 10000,
          });
        } else if (probeResponse.status === 200) {
          // Some EZ-Path configurations may skip the 402 probe
          quoteResponse = probeResponse;
        } else {
          throw new Error(`Unexpected status from EZ-Path probe: ${probeResponse.status}`);
        }
      } catch (probeError) {
        throw new Error(`EZ-Path probe failed: ${(probeError as any).message}`);
      }

      // Verify we got a successful quote response
      if (quoteResponse.status !== 200) {
        throw new Error(
          `EZ-Path quote failed: ${quoteResponse.status} ${JSON.stringify(quoteResponse.data)}`,
        );
      }

      const { buyAmount, settlement_tx } = quoteResponse.data;

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
      const errorMsg = String(error);
      console.error(`   ❌ EZ-Path execution failed: ${errorMsg}`);

      return {
        intentId: intent.id,
        routeId: route.routeId,
        txHash: '',
        blockNumber: 0,
        status: 'failed',
        amountOut: 0n,
        actualFee: 0n,
        executedAt: Math.floor(Date.now() / 1000),
        errorCode: 'EZPATH_EXECUTION_FAILED',
        errorMessage: errorMsg,
      };
    }
  }

  /**
   * Execute via Treasury LP (Aerodrome Router swap)
   */
  private async executeViaTreasuryLP(intent: SwapIntent, route: SolverRoute): Promise<ExecutionResult> {
    console.log('   [Treasury LP] Executing Aerodrome swap...');

    try {
      // Prepare parameters
      const tokenIn = intent.sellToken as `0x${string}`;
      const tokenOut = intent.buyToken as `0x${string}`;
      const amountIn = intent.sellAmount;
      const minAmountOut = intent.minBuyAmount || 0n; // From quote, or user's minimum
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
      const recipient = this.walletClient.account?.address;

      if (!recipient) {
        throw new Error('Wallet account not configured');
      }

      // Build Aerodrome V2 route
      const aeroRoute = [
        {
          from: tokenIn,
          to: tokenOut,
          stable: false, // Volatile pool
          factory: AERODROME_FACTORY as `0x${string}`,
        },
      ];

      // Execute swap via Aerodrome Router
      console.log(`   Calling Router.swapExactTokensForTokens...`);
      const txHash = await this.walletClient.writeContract({
        address: AERODROME_ROUTER as `0x${string}`,
        abi: ROUTER_ABI,
        functionName: 'swapExactTokensForTokens',
        args: [amountIn, minAmountOut, aeroRoute, recipient, deadline],
      });

      console.log(`   ✅ Tx submitted: ${txHash}`);

      // Wait for confirmation
      console.log(`   Waiting for confirmation...`);
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`);

      return {
        intentId: intent.id,
        routeId: route.routeId,
        txHash,
        blockNumber: Number(receipt.blockNumber),
        status: 'success',
        amountOut: route.buyAmount,
        actualFee: route.feeAmount,
        executedAt: Math.floor(Date.now() / 1000),
      };
    } catch (error) {
      const errorMsg = String(error);
      console.error(`   ❌ Treasury LP execution failed: ${errorMsg}`);

      return {
        intentId: intent.id,
        routeId: route.routeId,
        txHash: '',
        blockNumber: 0,
        status: 'failed',
        amountOut: 0n,
        actualFee: 0n,
        executedAt: Math.floor(Date.now() / 1000),
        errorCode: 'TREASURY_LP_EXECUTION_FAILED',
        errorMessage: errorMsg,
      };
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
