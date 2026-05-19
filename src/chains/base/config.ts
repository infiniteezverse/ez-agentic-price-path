import { base } from "viem/chains";
import { type ChainConfig } from "../types";

export const baseConfig: ChainConfig = {
  name: "Base",
  chainId: 8453,
  rpcUrl: "https://mainnet.base.org",
  rpcUrls: [
    "https://mainnet.base.org",
    "https://base.blockpi.network/v1/rpc/public",
    "https://base.publicnode.com",
    "https://1rpc.io/base",
  ],
  paymentToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
  decimals: 6,
  viemChain: base,
  venues: ["0x", "paraswap", "aerodrome", "uniswapv3"],
  contractAddresses: {
    aerodrome: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
    aerodrome_factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
    uniswap_v3: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
  },
};
