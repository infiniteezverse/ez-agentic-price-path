// On-chain verification of X402 USDC payment receipts.
// Looks up the tx receipt on Base and Ethereum, scans logs for a USDC `Transfer`
// to PAYMENT_WALLET_ADDRESS of >= UNLOCK_FEE_USDC.

const RPC = {
  1: process.env.ETH_RPC_URL || "https://ethereum-rpc.publicnode.com",
  8453: process.env.BASE_RPC_URL || "https://base-rpc.publicnode.com",
} as const;

const USDC = {
  1: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  8453: "0x833589fcdb6e08f4c7c32d4f71b54bda02913".padEnd(42, "0"), // safe value below
} as const;
// Use canonical lowercase addresses
const USDC_ETH = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Minimum unlock fee in USDC base units (6 decimals): 0.05 USDC = 50_000
const MIN_UNLOCK_BASE_UNITS = 50_000n;

export type VerifyResult = {
  ok: boolean;
  status:
    | "verified"
    | "invalid_format"
    | "not_found"
    | "no_matching_transfer"
    | "underpaid"
    | "no_payment_wallet"
    | "rpc_error";
  error?: string;
  chainId?: 1 | 8453;
  chainName?: "ethereum" | "base";
  payer?: string;
  amountUsdc?: number;
  txHash?: string;
};

function topicToAddress(topic: string): string {
  // 32-byte topic, last 20 bytes are the address
  return "0x" + topic.slice(-40).toLowerCase();
}

async function rpcCall(url: string, method: string, params: unknown[]): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} failed: ${res.status}`);
  const json: any = await res.json();
  if (json.error) throw new Error(`RPC ${method} error: ${json.error.message}`);
  return json.result;
}

async function checkChain(
  chainId: 1 | 8453,
  txHash: string,
  payTo: string,
): Promise<VerifyResult> {
  const url = RPC[chainId];
  const usdc = chainId === 1 ? USDC_ETH : USDC_BASE;
  const chainName = chainId === 1 ? "ethereum" : "base";

  let receipt: any;
  try {
    receipt = await rpcCall(url, "eth_getTransactionReceipt", [txHash]);
  } catch (e) {
    return { ok: false, status: "rpc_error", error: e instanceof Error ? e.message : String(e), chainId, chainName };
  }
  if (!receipt) return { ok: false, status: "not_found", chainId, chainName };
  if (receipt.status && receipt.status !== "0x1") {
    return { ok: false, status: "not_found", error: "tx reverted", chainId, chainName };
  }

  const payToLower = payTo.toLowerCase();
  let bestAmount = 0n;
  let payer: string | undefined;

  for (const log of receipt.logs ?? []) {
    if ((log.address ?? "").toLowerCase() !== usdc) continue;
    if (!log.topics || log.topics.length < 3) continue;
    if (log.topics[0].toLowerCase() !== TRANSFER_TOPIC) continue;
    const to = topicToAddress(log.topics[2]);
    if (to !== payToLower) continue;
    const value = BigInt(log.data);
    if (value > bestAmount) {
      bestAmount = value;
      payer = topicToAddress(log.topics[1]);
    }
  }

  if (bestAmount === 0n) {
    return { ok: false, status: "no_matching_transfer", chainId, chainName };
  }
  if (bestAmount < MIN_UNLOCK_BASE_UNITS) {
    return {
      ok: false,
      status: "underpaid",
      chainId,
      chainName,
      payer,
      amountUsdc: Number(bestAmount) / 1e6,
      error: `paid ${Number(bestAmount) / 1e6} USDC, need 0.05`,
    };
  }

  return {
    ok: true,
    status: "verified",
    chainId,
    chainName,
    payer,
    amountUsdc: Number(bestAmount) / 1e6,
    txHash,
  };
}

export async function verifyOnChainReceipt(receipt: string | null): Promise<VerifyResult> {
  if (!receipt || !/^0x[a-fA-F0-9]{64}$/.test(receipt)) {
    return { ok: false, status: "invalid_format" };
  }
  const payTo = process.env.PAYMENT_WALLET_ADDRESS;
  if (!payTo || !/^0x[a-fA-F0-9]{40}$/.test(payTo)) {
    return { ok: false, status: "no_payment_wallet", error: "PAYMENT_WALLET_ADDRESS not configured" };
  }

  // Race both chains; first success wins. If both fail, return Base's result for clarity.
  const [base, eth] = await Promise.all([
    checkChain(8453, receipt, payTo),
    checkChain(1, receipt, payTo),
  ]);
  if (base.ok) return base;
  if (eth.ok) return eth;
  // Prefer the more informative failure: prefer a "no_matching_transfer" over "not_found"
  if (eth.status !== "not_found") return eth;
  return base;
}
