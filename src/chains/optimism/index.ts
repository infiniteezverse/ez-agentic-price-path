import { EVMChain } from "../evm/EVMChain";
import { optimismConfig } from "./config";

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

export class Optimism extends EVMChain {
  protected config = optimismConfig;

  constructor(env: Env, kv: KVNamespace) {
    super(env, kv);
  }
}
