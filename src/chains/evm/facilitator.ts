// ─── Facilitator Settlement (Bazaar Indexing Support) ────────────────────────
// This module handles settlement through x402.org/facilitator for Bazaar discovery.

export interface AuthData {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

export async function settleThroughFacilitator(
  auth: AuthData,
  sig: string | undefined,
  facilitatorUrl: string,
  tollAddress: string,
  paymentToken: string,
  rawPayload?: unknown, // full decoded x402 payment (Base MCP / Smart Wallet)
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
    description: "Best-execution DEX quote on Base - races 0x, ParaSwap, Aerodrome, and Uniswap V3 and returns the highest buyAmount.",
    mimeType: "application/json",
    payTo: tollAddress,
    maxTimeoutSeconds: 300,
    asset: paymentToken,
  };
  const res = await fetch(`${facilitatorUrl}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x402Version: 1, paymentPayload, paymentRequirements }),
  });
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok || !data.success) {
    throw new Error(`facilitator_${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return (data.transaction ?? data.txHash ?? null) as string | null;
}
