import { polygon } from "viem/chains";
import { type ChainConfig } from "../types";

export const polygonConfig: ChainConfig = {
  name: "Polygon",
  chainId: 137,
  rpcUrl: "https://polygon-rpc.com",
  paymentToken: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e (Bridged USDC)
  decimals: 6,
  viemChain: polygon,
  venues: ["0x", "paraswap", "uniswapv3"],
  contractAddresses: {
    uniswap_v3: "0x1F98431c8aD98523631AE4a59f267346ea3feEcE",
  },
};
