## Goal
Replace the misconfigured `PAYMENT_WALLET_ADDRESS` (currently the USDC token contract address) with your real receiving wallet `0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad`.

## Steps

1. **Update the secret** via `secrets--update_secret` for `PAYMENT_WALLET_ADDRESS`. You'll be prompted to paste the new value:
   ```
   0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad
   ```
   This wallet receives:
   - X402 unlock fees (0.05 USDC per request) sent directly by callers
   - 0x affiliate fees (25 bps) on every executed swap, via `swapFeeRecipient`

2. **Verify propagation** (no code change needed — already wired through env):
   - `GET /.well-known/agent.json` → `auth.pay_to` and `affiliate_fee.recipient` should show the new address
   - `GET /api/v1/quote?...` (no receipt) → `payment.networks[].payTo` should show the new address
   - Top Routes panel still loads (sanity check)

3. **Republish** so the production URL `toll-bright-insight.lovable.app` serves the new wallet.

## Notes
- No code edits required — `PAYMENT_WALLET_ADDRESS` is read at request time in `src/lib/liquidity.server.ts`, `src/routes/api/v1/quote.ts`, and `src/routes/[.]well-known.agent[.]json.ts`.
- The address passes the `^0x[a-fA-F0-9]{40}$` regex used by the affiliate-fee gate, so 0x calls will continue to include the fee triplet.
- Old payments to the previous address (the USDC contract) are unrecoverable; nothing to migrate.