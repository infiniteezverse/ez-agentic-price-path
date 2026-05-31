/**
 * LP Manager — Handles Aerodrome V3 position lifecycle
 * Mints, rebalances, and burns positions
 */

import { PublicClient, WalletClient, parseEther, formatEther, getAddress } from 'viem';
import { LPPosition, MintPositionParams, RebalanceAction, NetworkConfig } from './types';

const AERODROME_POSITION_MANAGER_ABI = [
  {
    inputs: [
      { name: 'params', type: 'tuple', components: [
        { name: 'token0', type: 'address' },
        { name: 'token1', type: 'address' },
        { name: 'fee', type: 'uint24' },
        { name: 'tickLower', type: 'int24' },
        { name: 'tickUpper', type: 'int24' },
        { name: 'amount0Desired', type: 'uint256' },
        { name: 'amount1Desired', type: 'uint256' },
        { name: 'amount0Min', type: 'uint256' },
        { name: 'amount1Min', type: 'uint256' },
        { name: 'recipient', type: 'address' },
        { name: 'deadline', type: 'uint256' },
      ] }
    ],
    name: 'mint',
    outputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'positions',
    outputs: [
      { name: 'nonce', type: 'uint96' },
      { name: 'operator', type: 'address' },
      { name: 'token0', type: 'address' },
      { name: 'token1', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'tickLower', type: 'int24' },
      { name: 'tickUpper', type: 'int24' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'feeGrowthInside0LastX128', type: 'uint256' },
      { name: 'feeGrowthInside1LastX128', type: 'uint256' },
      { name: 'tokensOwed0', type: 'uint128' },
      { name: 'tokensOwed1', type: 'uint128' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'amount0Min', type: 'uint256' },
      { name: 'amount1Min', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'decreaseLiquidity',
    outputs: [
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'amount0Max', type: 'uint128' },
      { name: 'amount1Max', type: 'uint128' },
    ],
    name: 'collect',
    outputs: [
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
];

const ERC20_ABI = [
  {
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

export class LPManager {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private config: NetworkConfig;

  constructor(publicClient: PublicClient, walletClient: WalletClient, config: NetworkConfig) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.config = config;
  }

  /**
   * Mint a new LP position on Aerodrome
   */
  async mintPosition(
    usdcAmount: bigint,
    wethAmount: bigint,
    tickLower: number = -887200,  // Wide range default
    tickUpper: number = 887200,
  ): Promise<LPPosition> {
    console.log(`\n📍 Minting LP position...`);
    console.log(`   USDC: ${formatEther(usdcAmount)}`);
    console.log(`   WETH: ${formatEther(wethAmount)}`);

    const treasury = this.config.treasuryAddress;
    const deadline = Math.floor(Date.now() / 1000) + 3600;  // 1h deadline

    // 1. Approve USDC & WETH to PositionManager
    console.log('✓ Approving tokens...');
    await this.approveToken(this.config.usdc, this.config.aerodromePositionManager, usdcAmount);
    await this.approveToken(this.config.weth, this.config.aerodromePositionManager, wethAmount);

    // 2. Call mint()
    const params: MintPositionParams = {
      token0: this.config.usdc,
      token1: this.config.weth,
      fee: 1,                  // 0.01% fee tier on Aerodrome
      tickLower,
      tickUpper,
      amount0Desired: usdcAmount,
      amount1Desired: wethAmount,
      amount0Min: (usdcAmount * 95n) / 100n,    // 5% slippage
      amount1Min: (wethAmount * 95n) / 100n,
      recipient: treasury,
      deadline,
    };

    console.log('✓ Minting position on Aerodrome...');
    const hash = await this.walletClient.writeContract({
      address: getAddress(this.config.aerodromePositionManager),
      abi: AERODROME_POSITION_MANAGER_ABI,
      functionName: 'mint',
      args: [params],
      account: this.walletClient.account,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ Position minted: ${receipt.transactionHash}`);

    // 3. Extract tokenId from logs (Mint event)
    const mintLog = receipt.logs[0];
    const tokenId = '1';  // TODO: parse from event logs

    return {
      tokenId,
      pool: this.config.aerodromeRouter,
      lowerTick: tickLower,
      upperTick: tickUpper,
      liquidity: 0n,
      token0: this.config.usdc,
      token1: this.config.weth,
      owner: treasury,
      createdAtBlock: receipt.blockNumber,
      createdAtTimestamp: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Collect accumulated fees from a position
   */
  async collectFees(tokenId: string): Promise<{ amount0: bigint; amount1: bigint }> {
    console.log(`\n💰 Collecting fees from position ${tokenId}...`);

    const hash = await this.walletClient.writeContract({
      address: getAddress(this.config.aerodromePositionManager),
      abi: AERODROME_POSITION_MANAGER_ABI,
      functionName: 'collect',
      args: [
        BigInt(tokenId),
        2n ** 128n - 1n,  // Max amount0
        2n ** 128n - 1n,  // Max amount1
      ],
      account: this.walletClient.account,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ Fees collected: ${receipt.transactionHash}`);

    // TODO: Parse amounts from logs
    return { amount0: 0n, amount1: 0n };
  }

  /**
   * Get current position details
   */
  async getPosition(tokenId: string): Promise<LPPosition> {
    const data = await this.publicClient.readContract({
      address: getAddress(this.config.aerodromePositionManager),
      abi: AERODROME_POSITION_MANAGER_ABI,
      functionName: 'positions',
      args: [BigInt(tokenId)],
    });

    const [, , token0, token1, fee, tickLower, tickUpper, liquidity] = data as any;

    return {
      tokenId,
      pool: this.config.aerodromeRouter,
      lowerTick: tickLower,
      upperTick: tickUpper,
      liquidity,
      token0,
      token1,
      owner: this.config.treasuryAddress,
      createdAtBlock: 0,
      createdAtTimestamp: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Rebalance position if price has moved outside range
   */
  async rebalanceIfNeeded(tokenId: string): Promise<RebalanceAction> {
    const position = await this.getPosition(tokenId);
    const currentTick = 0;  // TODO: get from pool

    // If current tick is outside range, rebalance
    if (currentTick < position.lowerTick || currentTick > position.upperTick) {
      console.log(`\n⚠️  Position ${tokenId} out of range. Rebalancing...`);
      return {
        action: 'burn',
        reason: `Current tick ${currentTick} outside range [${position.lowerTick}, ${position.upperTick}]`,
        estimatedGasCost: parseEther('0.01'),
        position,
      };
    }

    return {
      action: 'none',
      reason: 'Position in range',
      estimatedGasCost: 0n,
    };
  }

  /**
   * Helper: Approve token to spender
   */
  private async approveToken(token: string, spender: string, amount: bigint): Promise<void> {
    const hash = await this.walletClient.writeContract({
      address: getAddress(token),
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [getAddress(spender), amount],
      account: this.walletClient.account,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
  }

  /**
   * Get treasury's USDC & WETH balances
   */
  async getBalances(): Promise<{ usdc: bigint; weth: bigint }> {
    const [usdc, weth] = await Promise.all([
      this.publicClient.readContract({
        address: getAddress(this.config.usdc),
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [getAddress(this.config.treasuryAddress)],
      }),
      this.publicClient.readContract({
        address: getAddress(this.config.weth),
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [getAddress(this.config.treasuryAddress)],
      }),
    ]);

    return { usdc: usdc as bigint, weth: weth as bigint };
  }
}
