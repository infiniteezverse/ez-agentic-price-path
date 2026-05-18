import { Base } from "./base";
import { Arbitrum } from "./arbitrum";
import { Optimism } from "./optimism";
import { Polygon } from "./polygon";
import { SolanaChain } from "./solana";
import { type IChain, type SupportedChain } from "./types";

interface Env {
  ZERO_EX_API_KEY: string;
  PARASWAP_API_KEY?: string;
  RELAYER_PRIVATE_KEY?: string;
  CDP_FACILITATOR_URL?: string;
  METERING: KVNamespace;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  BASE_RPC_URL?: string;
}

export function createChainRegistry(env: Env, kv: KVNamespace): Record<string, IChain> {
  return {
    base: new Base(env, kv),
    arbitrum: new Arbitrum(env, kv),
    optimism: new Optimism(env, kv),
    polygon: new Polygon(env, kv),
    solana: new SolanaChain(),
  };
}

export function getChain(registry: Record<string, IChain>, chain: SupportedChain): IChain {
  const chainImpl = registry[chain];
  if (!chainImpl) {
    throw new Error(`Unsupported chain: ${chain}`);
  }
  return chainImpl;
}
