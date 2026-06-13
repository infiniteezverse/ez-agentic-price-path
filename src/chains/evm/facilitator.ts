// ─── Facilitator Settlement (Bazaar Indexing Support) ────────────────────────
// Settles x402 payments through the Coinbase CDP facilitator (mainnet exact/base)
// when CDP API credentials are provided. CDP-witnessed settlement is what makes the
// resource discoverable in the x402 Bazaar / agentic.market. Falls back to the
// public x402.org facilitator (Base Sepolia only) when no CDP creds are present.

import { generateJwt } from "@coinbase/cdp-sdk/auth";

export interface AuthData {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

// Coinbase CDP facilitator — the only facilitator that settles Base mainnet
// (exact/base) AND records the resource for Bazaar discovery.
const CDP_FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";
const CDP_HOST = "api.cdp.coinbase.com";
const CDP_SETTLE_PATH = "/platform/v2/x402/settle";

// Build the CDP auth headers (Bearer JWT + correlation) for a /settle request.
// Uses jose/uncrypto under the hood, both of which run in the Workers runtime.
async function cdpSettleHeaders(apiKeyId: string, apiKeySecret: string): Promise<Record<string, string>> {
  const jwt = await generateJwt({
    apiKeyId,
    apiKeySecret,
    requestMethod: "POST",
    requestHost: CDP_HOST,
    requestPath: CDP_SETTLE_PATH,
  });
  return {
    Authorization: `Bearer ${jwt}`,
    "Correlation-Context": "sdk_language=typescript,source=x402,source_version=2.1.0",
  };
}

export async function settleThroughFacilitator(
  auth: AuthData,
  sig: string | undefined,
  facilitatorUrl: string,
  tollAddress: string,
  paymentToken: string,
  rawPayload?: unknown, // full decoded x402 payment (Base MCP / Smart Wallet)
  cdpApiKeyId?: string,
  cdpApiKeySecret?: string,
): Promise<string | null> {
  // Use raw payload if provided (Base MCP path), otherwise reconstruct from EIP-3009 fields
  const paymentPayload = rawPayload ?? {
    x402Version: 1,
    scheme: "exact",
    network: "base",
    payload: { signature: sig, authorization: auth },
  };
  const paymentRequirements = {
    scheme: "exact",
    network: "base",
    maxAmountRequired: auth.value,
    resource: "https://ezpath.myezverse.xyz/api/v1/quote",
    description: "Best-execution DEX quote on Base - races 10 venues (0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, Synthetix) and returns the highest buyAmount.",
    mimeType: "application/json",
    payTo: tollAddress,
    maxTimeoutSeconds: 300,
    asset: paymentToken,
    // EIP-712 domain of the USDC token (FiatToken v2.2 on Base). The facilitator
    // needs this to reconstruct the TransferWithAuthorization signing domain;
    // omitting it yields "missing EIP-712 domain parameters".
    extra: { name: "USD Coin", version: "2" },
  };

  // Prefer the Coinbase CDP facilitator whenever CDP credentials are available —
  // it settles mainnet exact/base AND triggers Bazaar indexing. Without creds,
  // fall back to the caller-supplied (public) facilitator URL.
  let url = facilitatorUrl;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cdpApiKeyId && cdpApiKeySecret) {
    url = CDP_FACILITATOR_URL;
    Object.assign(headers, await cdpSettleHeaders(cdpApiKeyId, cdpApiKeySecret));
  }

  const res = await fetch(`${url}/settle`, {
    method: "POST",
    headers,
    body: JSON.stringify({ x402Version: 1, paymentPayload, paymentRequirements }),
  });
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok || !data.success) {
    throw new Error(`facilitator_${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return (data.transaction ?? data.txHash ?? null) as string | null;
}
