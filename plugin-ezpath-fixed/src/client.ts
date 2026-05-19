import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

export interface EZPathQuoteRequest {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  slippagePercentage?: string;
  tier?: "basic" | "resilient" | "institutional";
}

export interface EZPathQuoteResponse {
  status: string;
  buyAmount: string;
  price: string;
  sources: string[];
  routingEngine: string;
  tier: string;
  expiresAt: number;
  requestId: string;
}

// ─── SECURITY: Production toll address hardcoded
const PRODUCTION_TOLL_ADDRESS = "0x13dde704389b1118b20d2bcc6d3ace749600e2ad".toLowerCase();
const EZPATH_ENDPOINT = "https://ezpath.myezverse.xyz/api/v1/quote";

export class EZPathClient {
  private privateKey: string;
  private walletAddress: string;
  private walletClient: ReturnType<typeof createWalletClient> | null = null;

  constructor(privateKey: string) {
    if (!privateKey || !privateKey.startsWith("0x")) {
      throw new Error("Invalid private key format");
    }
    this.privateKey = privateKey;
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    this.walletAddress = account.address;
  }

  private getWalletClient() {
    if (!this.walletClient) {
      const account = privateKeyToAccount(this.privateKey as `0x${string}`);
      this.walletClient = createWalletClient({
        account,
        chain: base,
        transport: http("https://mainnet.base.org"),
      }).extend(publicActions);
    }
    return this.walletClient;
  }

  async getQuote(params: EZPathQuoteRequest): Promise<EZPathQuoteResponse> {
    // Step 1: Probe endpoint (no payment) to get 402 challenge
    const probeUrl = new URL(EZPATH_ENDPOINT);
    probeUrl.searchParams.set("sellToken", params.sellToken);
    probeUrl.searchParams.set("buyToken", params.buyToken);
    probeUrl.searchParams.set("sellAmount", params.sellAmount);
    if (params.slippagePercentage) {
      probeUrl.searchParams.set("slippagePercentage", params.slippagePercentage);
    }

    const probe = await fetch(probeUrl.toString());

    if (probe.status === 402) {
      // Get payment requirements
      const probeBody = (await probe.json()) as {
        unlock_fee_usd: number;
        tiers: Record<string, { min_atomic: string; min_usdc: number }>;
        request_id: string;
      };

      // Determine tier and corresponding payment amount
      const tier = params.tier ?? "basic";
      const tierToAtomic: Record<string, string> = {
        basic: "30000",
        resilient: "100000",
        institutional: "500000",
      };

      const paymentAmount = tierToAtomic[tier] || tierToAtomic["basic"];

      // Step 2: Get toll address from 402 response header
      const tollAddressHeader = probe.headers.get("X-402-Address");
      if (!tollAddressHeader) {
        throw new Error("SECURITY: 402 response missing X-402-Address header");
      }

      // ─── SECURITY FIX: Validate toll address against production value
      const providedToll = tollAddressHeader.toLowerCase();
      if (!providedToll.match(/^0x[a-f0-9]{40}$/)) {
        throw new Error("SECURITY: Invalid toll address format from server");
      }

      if (providedToll !== PRODUCTION_TOLL_ADDRESS) {
        throw new Error(
          `SECURITY FAULT: Toll address mismatch detected. ` +
          `Expected: ${PRODUCTION_TOLL_ADDRESS}, ` +
          `Got: ${providedToll}. ` +
          `This could indicate DNS spoofing or MITM attack. Aborting payment.`
        );
      }

      // Step 3: Sign EIP-3009 authorization
      const nonce = `0x${crypto.getRandomValues(new Uint8Array(32)).toString()}`;
      const now = Math.floor(Date.now() / 1000);
      const validAfter = now;
      const validBefore = now + 15;

      // Build EIP-712 message
      const domain = {
        name: "USD Coin",
        version: "2",
        chainId: 8453,
        verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
      };

      const types = {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      };

      const message = {
        from: this.walletAddress as `0x${string}`,
        to: providedToll as `0x${string}`,
        value: BigInt(paymentAmount),
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        nonce: nonce as `0x${string}`,
      };

      const client = this.getWalletClient();
      const account = privateKeyToAccount(this.privateKey as `0x${string}`);
      const signature = await client.signTypedData({
        account,
        domain,
        types,
        primaryType: "TransferWithAuthorization",
        message,
      });

      // Step 4: Send quote request WITH payment
      const paymentPayload = {
        payload: {
          signature,
          authorization: message,
          quote_issued_at: Date.now(),
        },
      };

      const paymentHeader = btoa(JSON.stringify(paymentPayload));

      const quoteResponse = await fetch(probeUrl.toString(), {
        method: "GET",
        headers: {
          "X-Payment": paymentHeader,
        },
      });

      if (!quoteResponse.ok) {
        throw new Error(`Quote request failed: ${quoteResponse.status}`);
      }

      const quote = (await quoteResponse.json()) as EZPathQuoteResponse;
      return quote;
    }

    throw new Error(`Unexpected response status: ${probe.status}`);
  }
}
