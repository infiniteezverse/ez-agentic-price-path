import { optimism } from "viem/chains";
import { type ChainConfig } from "../types";

export const optimismConfig: ChainConfig = {
  name: "Optimism",
  chainId: 10,
  rpcUrl: "https://mainnet.optimism.io",
  rpcUrls: [
    "https://mainnet.optimism.io",
    "https://optimism.blockpi.network/v1/rpc/public",
    "https://optimism.publicnode.com",
    "https://1rpc.io/op",
  ],
  paymentToken: "0x0b2c639c533813f4aa9d7837caf62653d08d5b82", // USDC
  decimals: 6,
  viemChain: optimism,
  venues: ["0x", "paraswap", "uniswapv3"],
  contractAddresses: {
    uniswap_v3: "0x1F32b14520f89430e271b2f4f0E6fC3f65c81A1c",
  },
};
