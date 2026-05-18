export type SupportedChain = "base" | "solana";

export interface ChainConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  paymentToken: string;
  decimals: number;
  viemChain: any; // viem chain object (EVM only, null for Solana)
  venues: string[];
}

export type ChainConfigMap = Record<SupportedChain, ChainConfig>;
