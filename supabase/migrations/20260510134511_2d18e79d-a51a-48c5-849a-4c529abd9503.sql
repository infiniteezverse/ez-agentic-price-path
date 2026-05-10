ALTER TABLE public.quote_calls ADD COLUMN request_id text;
CREATE INDEX IF NOT EXISTS idx_quote_calls_request_id ON public.quote_calls(request_id);