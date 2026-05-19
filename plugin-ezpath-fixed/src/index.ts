import { Plugin } from "@elizaos/core";
import { getQuoteAction } from "./actions/getQuote";

export const ezpathPlugin: Plugin = {
  name: "plugin-ezpath",
  description: "EZ-Path: Pay-per-request DEX meta-router on Base mainnet",
  actions: [getQuoteAction],
  evaluators: [],
  providers: [],
};

export default ezpathPlugin;
export { EZPathClient } from "./client";
export type { EZPathQuoteRequest, EZPathQuoteResponse } from "./client";
