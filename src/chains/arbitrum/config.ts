import { arbitrum } from "viem/chains";
import { type ChainConfig } from "../types";

export const arbitrumConfig: ChainConfig = {
  name: "Arbitrum",
  chainId: 42161,
  rpcUrl: "https://arb1.arbitrum.io/rpc",
  rpcUrls: [
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum.blockpi.network/v1/rpc/public",
    "https://arbitrum.publicnode.com",
    "https://1rpc.io/arb",
  ],
  paymentToken: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5F86", // USDC
  decimals: 6,
  viemChain: arbitrum,
  venues: ["0x", "paraswap", "uniswapv3"],
  contractAddresses: {
    uniswap_v3: "0xC31E54c7a869B9FcBEcc14363CF510d1c41fa443",
  },
};
