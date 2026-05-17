#!/usr/bin/env node
/**
 * EZ-Path Local Proxy
 *
 * Runs a local HTTP server that accepts plain quote requests and handles
 * X402 payment signing automatically. Agents call localhost — zero crypto
 * knowledge required.
 *
 * Usage:
 *   WALLET_KEY=0x... node dist/index.js
 *
 * GET http://localhost:3002/quote?sellToken=...&buyToken=...&sellAmount=...
 *
 * Optional query params:
 *   tier=basic|resilient|institutional  (default: basic)
 *   slippagePercentage=0.01
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { privateKeyToAccount } from "viem/accounts";

const EZPATH_URL   = "https://ezpath.myezverse.xyz/api/v1/quote";
const USDC_BASE    = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TOLL_ADDRESS = "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad";
const PORT         = parseInt(process.env.PORT ?? "3002");

const TIER_ATOMIC: Record<string, bigint> = {
  basic:         30_000n,
  resilient:     100_000n,
  institutional: 500_000n,
};

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from",        type: "address" },
    { name: "to",          type: "address" },
    { name: "value",       type: "uint256" },
    { name: "validAfter",  type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce",       type: "bytes32" },
  ],
} as const;

async function buildPaymentHeader(privateKey: string, value: bigint): Promise<string> {
  const key     = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const account = privateKeyToAccount(key);

  const nonceBytes  = crypto.getRandomValues(new Uint8Array(32));
  const nonce       = `0x${Array.from(nonceBytes).map(b => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
  const validAfter  = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300);

  const signature = await account.signTypedData({
    domain: {
      name:              "USD Coin",
      version:           "2",
      chainId:           8453,
      verifyingContract: USDC_BASE as `0x${string}`,
    },
    types:       EIP3009_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from:        account.address,
      to:          TOLL_ADDRESS as `0x${string}`,
      value,
      validAfter,
      validBefore,
      nonce,
    },
  });

  const payload = {
    payload: {
      authorization: {
        from:        account.address,
        to:          TOLL_ADDRESS,
        value:       value.toString(),
        validAfter:  validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
      signature,
    },
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(data);
}

async function handleQuote(req: IncomingMessage, res: ServerResponse, params: URLSearchParams): Promise<void> {
  const walletKey = process.env.WALLET_KEY;
  if (!walletKey) {
    sendJson(res, 500, { error: "WALLET_KEY environment variable not set" });
    return;
  }

  const sellToken  = params.get("sellToken");
  const buyToken   = params.get("buyToken");
  const sellAmount = params.get("sellAmount");

  if (!sellToken || !buyToken || !sellAmount) {
    sendJson(res, 400, {
      error:   "missing required params",
      missing: ["sellToken", "buyToken", "sellAmount"].filter(k => !params.get(k)),
    });
    return;
  }

  const tierName = params.get("tier") ?? "basic";
  const atomic   = TIER_ATOMIC[tierName] ?? TIER_ATOMIC.basic;

  const upstream = new URL(EZPATH_URL);
  upstream.searchParams.set("sellToken",  sellToken);
  upstream.searchParams.set("buyToken",   buyToken);
  upstream.searchParams.set("sellAmount", sellAmount);
  if (params.get("slippagePercentage")) {
    upstream.searchParams.set("slippagePercentage", params.get("slippagePercentage")!);
  }

  try {
    const header   = await buildPaymentHeader(walletKey, atomic);
    const response = await fetch(upstream.toString(), {
      headers: { "X-Payment": header },
    });

    const body = await response.json();
    sendJson(res, response.status, body);

    if (response.ok) {
      const b = body as { tier?: string; routing_metadata?: { winner?: string; execution_mode?: string } };
      console.log(`[quote] ✓ tier=${b.tier} winner=${b.routing_metadata?.winner} mode=${b.routing_metadata?.execution_mode}`);
    } else {
      console.error(`[quote] ✗ status=${response.status}`, body);
    }
  } catch (err) {
    console.error("[quote] fetch error", err);
    sendJson(res, 502, { error: "upstream request failed", detail: err instanceof Error ? err.message : String(err) });
  }
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" });
    res.end();
    return;
  }

  const url    = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const params = url.searchParams;

  if (req.method === "GET" && url.pathname === "/quote") {
    await handleQuote(req, res, params);
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { status: "ok", proxy: "ezpath-proxy", version: "1.0.0" });
    return;
  }

  sendJson(res, 404, { error: "not found", routes: ["GET /quote", "GET /health"] });
});

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║       EZ-Path Proxy  v1.0.0           ║
║  Listening on http://localhost:${PORT}  ║
╠════════════════════════════════════════╣
║  GET /quote?sellToken=&buyToken=      ║
║             &sellAmount=&tier=        ║
║                                       ║
║  X402 signing handled automatically.  ║
╚════════════════════════════════════════╝
`);

  if (!process.env.WALLET_KEY) {
    console.warn("⚠️  WALLET_KEY not set — quote requests will return 500");
  }
});
