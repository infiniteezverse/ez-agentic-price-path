import { arbitrum } from "viem/chains";
import { type ChainConfig } from "../types";

export const arbitrumConfig: ChainConfig = {
  name: "Arbitrum",
  chainId: 42161,
  rpcUrl: "https://arb1.arbitrum.io/rpc",
  paymentToken: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5F86", // USDC.e (Bridged USDC)
  decimals: 6,
  viemChain: arbitrum,
  venues: ["0x", "paraswap", "uniswapv3"],
  contractAddresses: {
    uniswap_v3: "0x1F98431c8aD98523631AE4a59f267346ea3feEcE",
  },
};
