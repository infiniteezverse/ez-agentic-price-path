import { optimism } from "viem/chains";
import { type ChainConfig } from "../types";

export const optimismConfig: ChainConfig = {
  name: "Optimism",
  chainId: 10,
  rpcUrl: "https://mainnet.optimism.io",
  paymentToken: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff47", // USDC (native)
  decimals: 6,
  viemChain: optimism,
  venues: ["0x", "paraswap", "uniswapv3"],
  contractAddresses: {
    uniswap_v3: "0x1F98431c8aD98523631AE4a59f267346ea3feEcE",
  },
};
