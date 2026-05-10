## Goal
Enable 0x affiliate fee collection on every quote so swaps routed through this API earn revenue to the project's payment wallet.

## Background
0x v2 (`/swap/permit2/price` and `/swap/permit2/quote`) uses a different parameter naming than v1:
- `swapFeeRecipient` — wallet that receives the fee (we already have `PAYMENT_WALLET_ADDRESS`)
- `swapFeeBps` — fee in basis points (e.g. `25` = 0.25%)
- `swapFeeToken` — the token the fee is taken in (must be either `buyToken` or `sellToken`; convention is `buyToken`)

All three are required together; sending only one returns a 400.

## Changes

### 1. `src/lib/liquidity.server.ts` — add fee params to the 0x request
In `fetch0xQuote`, after the existing `searchParams.set` calls, append the affiliate-fee triplet only when a payment wallet is configured:

```ts
const feeRecipient = process.env.PAYMENT_WALLET_ADDRESS;
const feeBps = process.env.ZEROX_FEE_BPS ?? "25"; // default 0.25%
if (feeRecipient && /^0x[a-fA-F0-9]{40}$/.test(feeRecipient)) {
  url.searchParams.set("swapFeeRecipient", feeRecipient);
  url.searchParams.set("swapFeeBps", feeBps);
  url.searchParams.set("swapFeeToken", params.buyToken);
}
```

This keeps dashboard top-routes calls working even if the wallet env var is unset (no fee added rather than a hard 400).

### 2. Surface the fee in the API response
In `src/routes/api/v1/quote.ts`, parse `data.fees` from `quote.raw` (0x v2 echoes a `fees.integratorFee` block) and include it in the unlocked response as:

```ts
affiliateFee: {
  recipient: <wallet>,
  bps: <bps>,
  amount: <fees.integratorFee.amount>,
  token: <fees.integratorFee.token>,
}
```

So callers can audit what fee was applied.

### 3. Agent manifest disclosure
In `src/routes/[.]well-known.agent[.]json.ts`, add an `affiliate_fee` block under the `quote` endpoint describing the bps charged and the recipient — required for honest agent discovery.

### 4. Optional secret
Add `ZEROX_FEE_BPS` as an optional secret (defaults to `25`) so the fee rate can be tuned without a redeploy. Not added now unless you want a non-default rate.

## Verification
1. `curl` the quote endpoint and confirm 200 (not 400) and that `raw.fees.integratorFee.recipient` matches `PAYMENT_WALLET_ADDRESS`.
2. Check `/.well-known/agent.json` shows the `affiliate_fee` block.
3. Dashboard "Top Routes" still loads (no regression).

## Out of scope
- On-chain verification that the fee actually settled to the wallet (requires executing a real swap with the returned permit2 calldata; this API only returns indicative quotes).
- Changing the X402 unlock fee logic — that's a separate revenue stream from the swap fee.