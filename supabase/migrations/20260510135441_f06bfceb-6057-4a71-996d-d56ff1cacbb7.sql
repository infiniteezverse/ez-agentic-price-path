-- 1. Drop the permissive public SELECT policy on quote_calls.
DROP POLICY IF EXISTS "Anyone can view quote call log" ON public.quote_calls;

-- (RLS stays enabled; with no SELECT policy, anon/authenticated roles get zero rows.
--  The API writes via the service role, which bypasses RLS.)

-- 2. Safe public view: only non-sensitive columns + masked payer.
CREATE OR REPLACE VIEW public.quote_calls_public
WITH (security_invoker = on) AS
SELECT
  id,
  created_at,
  chain_id,
  pair,
  payment_chain,
  payment_amount_usdc,
  receipt_tx_hash,
  unlocked,
  CASE
    WHEN payer_address IS NULL THEN NULL
    ELSE substr(payer_address, 1, 6) || '…' || substr(payer_address, length(payer_address) - 3)
  END AS payer_short
FROM public.quote_calls
WHERE unlocked = true;

GRANT SELECT ON public.quote_calls_public TO anon, authenticated;