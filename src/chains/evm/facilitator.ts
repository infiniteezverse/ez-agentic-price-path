// ─── Facilitator Settlement (Bazaar Indexing Support) ────────────────────────
// Settles x402 payments through the Coinbase CDP facilitator (mainnet exact/base)
// when CDP API credentials are provided. CDP-witnessed settlement is what makes the
// resource discoverable in the x402 Bazaar / agentic.market. Falls back to the
// public x402.org facilitator (Base Sepolia only) when no CDP creds are present.

import { generateJwt } from "@coinbase/cdp-sdk/auth";

export interface AuthData {
    from: string;
    to: string
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

// Single source of truth for the resource URL used in both paymentPayload.resource
// and paymentRequirements.resource. CDP keys the Bazaar catalog off
// paymentPayload.resource — if the two values disagree the entry never appears.
const RESOURCE_URL = "https://api.myezverse.xyz/api/v1/quote";

// Bazaar discovery extension — echoed from the 402 response into the settle payload.
// The CDP facilitator validates info against schema, then catalogs the endpoint.
// Must be present in BOTH paymentPayload.extensions AND paymentRequirements.extensions
// or the facilitator ignores the bazaar block entirely.
const BAZAAR_EXTENSION = {
    info: {
          input: {
                  type: "http",
                  method: "GET",
                  queryParams: {
                            sellToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                            buyToken: "0x4200000000000000000000000000000000000006",
                            sellAmount: "1000000",
                  },
          },
          output: {
                  type: "json",
                  example: {
                            sellToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                            buyToken: "0x4200000000000000000000000000000000000006",
                            sellAmount: "1000000",
                            buyAmount: "998500000000000000",
                            price: "0.9985",
                            sources: [
                              { name: "0x", proportion: "0.70" },
                              { name: "Uniswap V3", proportion: "0.30" },
                                      ],
                            estimatedGas: "210000",
                  },
          },
    },
    schema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: {
                  input: {
                            type: "object",
                            properties: {
                                        type: { type: "string", const: "http" },
                                        method: { type: "string", enum: ["GET"] },
                                        queryParams: {
                                                      type: "object",
                                                      properties: {
                                                                      sellToken: { type: "string" },
                                                                      buyToken: { type: "string" },
                                                                      sellAmount: { type: "string" },
                                                      },
                                                      required: ["sellToken", "buyToken", "sellAmount"],
                                        },
                            },
                            required: ["type", "method"],
                            additionalProperties: false,
                  },
                  output: {
                            type: "object",
                            properties: {
                                        type: { type: "string" },
                                        example: { type: "object" },
                            },
                            required: ["type"],
                  },
          },
          required: ["input"],
    },
};

// Build the CDP auth headers (Bearer JWT + correlation) for a /settle request.
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
    // Build paymentPayload — include resource + extensions so CDP can catalog the endpoint.
  // If rawPayload is provided (Base MCP / Smart Wallet path) we merge resource +
  // extensions into it rather than overwriting, preserving the original signature fields.
  let paymentPayload: Record<string, unknown>;
    if (rawPayload && typeof rawPayload === "object") {
          paymentPayload = {
                  ...(rawPayload as Record<string, unknown>),
                  // resource is the catalog key — CDP indexes by paymentPayload.resource
                  resource: {
                    url: RESOURCE_URL,
                    description: "Best-execution DEX quote on Base — races 10 venues (0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, Synthetix) and returns the highest buyAmount",
                    mimeType: "application/json",
                  },
                  extensions: { bazaar: BAZAAR_EXTENSION },
          };
    } else {
          paymentPayload = {
                  x402Version: 1,
                  scheme: "exact",
                  network: "base",
                  resource: {
                    url: RESOURCE_URL,
                    description: "Best-execution DEX quote on Base — races 10 venues (0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, Synthetix) and returns the highest buyAmount",
                    mimeType: "application/json",
                  },
                  payload: { signature: sig, authorization: auth },
                  extensions: { bazaar: BAZAAR_EXTENSION },
          };
    }

  const paymentRequirements = {
        scheme: "exact",
        network: "base",
        maxAmountRequired: auth.value,
        // Must match paymentPayload.resource exactly — CDP validates the two are consistent
        resource: RESOURCE_URL,
        description: "Best-execution DEX quote on Base - races 10 venues (0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, Synthetix) and returns the highest buyAmount.",
        mimeType: "application/json",
        payTo: tollAddress,
        maxTimeoutSeconds: 300,
        asset: paymentToken,
        // EIP-712 domain of the USDC token (FiatToken v2.2 on Base).
        extra: { name: "USD Coin", version: "2" },
        // Echo bazaar extension into paymentRequirements as well — the CDP facilitator
        // spec requires the extension to appear on both sides of the settle body.
        extensions: { bazaar: BAZAAR_EXTENSION },
  };

  // Prefer the Coinbase CDP facilitator whenever CDP credentials are available —
  // it settles mainnet exact/base AND triggers Bazaar indexing.
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

  // Log the EXTENSION-RESPONSES header — tells us if bazaar cataloging succeeded,
  // is processing, or was rejected. Decoding: base64 → JSON → { bazaar: { status } }
  const extResp = res.headers.get("EXTENSION-RESPONSES") ?? res.headers.get("extension-responses");
    if (extResp) {
          try {
                  const decoded = JSON.parse(atob(extResp)) as { bazaar?: { status?: string; rejectedReason?: string } };
                  console.log(`[facilitator] bazaar index status: ${decoded.bazaar?.status ?? "unknown"}`,
                                      decoded.bazaar?.rejectedReason ? `reason: ${decoded.bazaar.rejectedReason}` : "");
          } catch {
                  console.log(`[facilitator] EXTENSION-RESPONSES (raw): ${extResp}`);
          }
    } else {
          console.log("[facilitator] no EXTENSION-RESPONSES header — CDP may not support bazaar echo on this request");
    }

  if (!res.ok || !data.success) {
        throw new Error(`facilitator_${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  }
    return (data.transaction ?? data.txHash ?? null) as string | null;
}
