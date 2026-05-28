import { EVMChain } from "../evm/EVMChain";
import { baseConfig } from "./config";

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

export class Base extends EVMChain {
  protected config = { ...baseConfig };

  constructor(env: Env, kv: KVNamespace) {
    super(env, kv);
    // Use Alchemy (or any injected RPC) over the public rate-limited fallback
    if (env.BASE_RPC_URL) {
      this.config.rpcUrl = env.BASE_RPC_URL;
      this.config.rpcUrls = [env.BASE_RPC_URL, ...baseConfig.rpcUrls];
    }
  }
}
