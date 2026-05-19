import { polygonConfig } from "./config";
import { EVMChain } from "../evm/EVMChain";

interface Env {
  ZERO_EX_API_KEY: string;
  PARASWAP_API_KEY?: string;
  RELAYER_PRIVATE_KEY?: string;
  CDP_FACILITATOR_URL?: string;
  METERING: KVNamespace;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export class Polygon extends EVMChain {
  protected config = polygonConfig;

  constructor(env: Env, kv: KVNamespace) {
    super(env, kv);
  }
}
