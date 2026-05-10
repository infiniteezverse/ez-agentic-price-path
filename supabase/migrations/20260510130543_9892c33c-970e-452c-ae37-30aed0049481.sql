-- Quote API call log: every X402-gated /api/v1/quote attempt with on-chain verification result
CREATE TABLE public.quote_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  chain_id INTEGER NOT NULL,
  sell_token TEXT NOT NULL,
  buy_token TEXT NOT NULL,
  sell_amount TEXT NOT NULL,
  pair TEXT NOT NULL,
  receipt_tx_hash TEXT,
  payer_address TEXT,
  payment_chain TEXT,
  payment_amount_usdc NUMERIC(20, 6),
  unlocked BOOLEAN NOT NULL DEFAULT false,
  verification_status TEXT NOT NULL,
  verification_error TEXT,
  client_ip_hash TEXT,
  user_agent TEXT
);

CREATE INDEX idx_quote_calls_created_at ON public.quote_calls (created_at DESC);
CREATE INDEX idx_quote_calls_unlocked ON public.quote_calls (unlocked, created_at DESC);
-- Prevent receipt replay: same tx hash cannot unlock twice
CREATE UNIQUE INDEX idx_quote_calls_receipt_unique ON public.quote_calls (receipt_tx_hash) WHERE unlocked = true AND receipt_tx_hash IS NOT NULL;

ALTER TABLE public.quote_calls ENABLE ROW LEVEL SECURITY;

-- Public read access: redacted feed shown on landing page
CREATE POLICY "Anyone can view quote call log"
  ON public.quote_calls FOR SELECT
  USING (true);

-- No public insert/update/delete — server inserts via service role only.