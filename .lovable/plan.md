## Goal

Lock down `quote_calls` so wallet addresses, IP hashes, user agents, and internal verification fields are no longer exposed via the public anon key, while keeping the public "recent tolls" feed working on the homepage. Also clean up two related findings flagged by the scanner.

## Why not "just do it in the Supabase dashboard"

In this project all schema and policy changes are version-controlled via `supabase/migrations/*.sql`. Editing policies in the dashboard would drift from the repo and get overwritten. The fix below is the same change, done as a migration so it survives deploys.

## Changes

### 1. Tighten RLS on `quote_calls` (migration)

- Drop the existing `Anyone can view quote call log` policy (`USING (true)`).
- Do **not** add any public `SELECT` policy. With RLS enabled and no policy, the anon key gets zero rows — exactly what we want.
- Do **not** add a public `INSERT` policy either. The API writes through `supabaseAdmin` (service role), which bypasses RLS, so inserts keep working without exposing a public write surface.
- Create a safe public view `public.quote_calls_public` exposing only non-sensitive columns: `id, created_at, chain_id, pair, payment_chain, payment_amount_usdc, receipt_tx_hash, unlocked`, plus a masked `payer_short` (e.g. `0x1234…abcd`) derived from `payer_address`. Grant `SELECT` on this view to `anon` and `authenticated`.

This satisfies the `quote_calls_public_exposure` and `quote_calls_full_select` findings.

### 2. Repoint the public feed to the safe view

- `src/lib/feed.functions.ts`: query `quote_calls_public` instead of `quote_calls`. Update `FeedRow` to drop `payer_address` and add `payer_short`.
- `src/routes/index.tsx`: render `payer_short` instead of slicing `payer_address` client-side.

### 3. Sanitize upstream 0x error passthrough (`zerox_error_passthrough`)

- `src/lib/liquidity.server.ts`: keep full `console.error` server-side, but `throw new Error("upstream_quote_failed")`.
- `src/routes/api/v1/quote.ts`: in the 502 branch, return `{ error: "Upstream quote failed" }` only — drop the `message` field.

### 4. Close the receipt-replay TOCTOU race (`receipt_replay_toctou`)

- `src/lib/quote-log.server.ts`: change `logQuoteCall` to return `{ inserted: boolean }` and stop swallowing unique-violation errors silently — detect Postgres error code `23505` on `idx_quote_calls_receipt_unique` and return `inserted: false` instead of throwing.
- `src/routes/api/v1/quote.ts` and `src/lib/mcp/tools/quote.ts`: when a receipt is provided and verification passes, attempt the insert **first**. If `inserted === false` (receipt already consumed), fall through to the 402 path with `receipt_status: "already_used"` instead of returning an unlocked 200.

## Out of scope

- No changes to auth, JWKS, OpenAPI spec, or x402 headers.
- No new tables; only one new view.
- No UI redesign — only the field name/format change in the feed row.

## Acceptance checks

- `curl https://<project>.supabase.co/rest/v1/quote_calls?select=*` with the anon key returns `[]` (or 401-style empty result), not rows.
- `curl https://<project>.supabase.co/rest/v1/quote_calls_public?select=*` returns rows with **no** `payer_address`, `client_ip_hash`, `user_agent`, `verification_status`, `verification_error`, or `request_id`.
- Homepage "recent tolls" feed still renders, showing masked payer (`0x1234…abcd`).
- `/api/v1/quote` with a bad upstream response returns `{ "error": "Upstream quote failed" }` with no 0x details.
- Two concurrent `/api/v1/quote` calls sharing one tx hash: exactly one returns 200 unlocked; the other returns 402 with `receipt_status: "already_used"`.
- Re-running the security scan clears all four current findings.
