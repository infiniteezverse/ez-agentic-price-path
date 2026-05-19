import { polygon } from "viem/chains";
import { type ChainConfig } from "../types";

export const polygonConfig: ChainConfig = {
  name: "Polygon",
  chainId: 137,
  rpcUrl: "https://polygon-rpc.com",
  rpcUrls: [
    "https://polygon-rpc.com",
    "https://polygon.blockpi.network/v1/rpc/public",
    "https://polygon.publicnode.com",
    "https://1rpc.io/matic",
  ],
  paymentToken: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", // USDC
  decimals: 6,
  viemChain: polygon,
  venues: ["0x", "paraswap", "uniswapv3"],
  contractAddresses: {
    uniswap_v3: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  },
};
