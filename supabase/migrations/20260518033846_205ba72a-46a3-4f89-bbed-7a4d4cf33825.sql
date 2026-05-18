-- Dashboard-ready telemetry schema
-- Execution Records: Full ExecutionRecord historical data
-- Daily Chain Metrics: Aggregated operator metrics per chain
-- Daily Agent Metrics: Aggregated payer metrics per chain

-- Table: execution_records
-- Cold storage for detailed ExecutionRecord data (populated from Supabase client writes)
CREATE TABLE IF NOT EXISTS execution_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE,
  timestamp TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN ('base', 'solana', 'arbitrum', 'optimism', 'polygon')),
  payer TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('basic', 'resilient', 'institutional')),

  -- Financial Metrics
  fee_atomic BIGINT NOT NULL,
  fee_usd NUMERIC(10, 6) NOT NULL,
  relayer_cost_gas TEXT,
  relayer_cost_usd NUMERIC(10, 6),
  net_margin_usd NUMERIC(10, 6),

  -- Performance Telemetry
  execution_mode TEXT NOT NULL CHECK (execution_mode IN ('direct', 'concurrent_race', 'emergency_fallback')),
  winner TEXT NOT NULL,
  total_latency_ms INTEGER NOT NULL,
  venues JSONB,
  edge_bps INTEGER,

  -- Settlement
  settlement_attempted BOOLEAN NOT NULL,
  settlement_status TEXT NOT NULL CHECK (settlement_status IN ('pending', 'success', 'failed')),
  settlement_tx TEXT UNIQUE,
  settlement_error TEXT,

  -- Operational
  fallback_used BOOLEAN DEFAULT FALSE,
  mev_flags TEXT[],
  error_classification TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS execution_records_timestamp_idx ON execution_records(timestamp);
CREATE INDEX IF NOT EXISTS execution_records_chain_idx ON execution_records(chain);
CREATE INDEX IF NOT EXISTS execution_records_payer_idx ON execution_records(payer);
CREATE INDEX IF NOT EXISTS execution_records_chain_payer_idx ON execution_records(chain, payer);
CREATE INDEX IF NOT EXISTS execution_records_settlement_tx_idx ON execution_records(settlement_tx);

-- Table: daily_chain_metrics
-- Aggregated operator metrics per chain per day (populated by nightly ETL from KV)
CREATE TABLE IF NOT EXISTS daily_chain_metrics (
  date DATE NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN ('base', 'solana', 'arbitrum', 'optimism', 'polygon')),

  request_count INTEGER NOT NULL DEFAULT 0,
  total_revenue_atomic BIGINT NOT NULL DEFAULT 0,
  total_revenue_usd NUMERIC(15, 2) NOT NULL DEFAULT 0,

  avg_latency_ms NUMERIC(10, 2),
  p95_latency_ms INTEGER,
  p99_latency_ms INTEGER,

  settlement_success_rate NUMERIC(5, 2),
  settlement_success_count INTEGER DEFAULT 0,
  settlement_total_count INTEGER DEFAULT 0,

  fallback_count INTEGER DEFAULT 0,
  fallback_reasons JSONB,

  error_breakdown JSONB,
  venue_summary JSONB,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, chain)
);

-- Indexes
CREATE INDEX IF NOT EXISTS daily_chain_metrics_date_idx ON daily_chain_metrics(date);
CREATE INDEX IF NOT EXISTS daily_chain_metrics_chain_idx ON daily_chain_metrics(chain);

-- Table: daily_agent_metrics
-- Aggregated payer metrics per chain per day (populated by nightly ETL from KV)
CREATE TABLE IF NOT EXISTS daily_agent_metrics (
  date DATE NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN ('base', 'solana', 'arbitrum', 'optimism', 'polygon')),
  payer TEXT NOT NULL,

  request_count INTEGER NOT NULL DEFAULT 0,
  total_fees_atomic BIGINT NOT NULL DEFAULT 0,
  total_fees_usd NUMERIC(15, 2) NOT NULL DEFAULT 0,

  avg_latency_ms NUMERIC(10, 2),
  p95_latency_ms INTEGER,
  avg_edge_bps NUMERIC(10, 2),

  success_rate NUMERIC(5, 2),
  tier_breakdown JSONB,
  routing_engine_usage JSONB,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, chain, payer)
);

-- Indexes
CREATE INDEX IF NOT EXISTS daily_agent_metrics_date_idx ON daily_agent_metrics(date);
CREATE INDEX IF NOT EXISTS daily_agent_metrics_chain_idx ON daily_agent_metrics(chain);
CREATE INDEX IF NOT EXISTS daily_agent_metrics_payer_idx ON daily_agent_metrics(payer);
CREATE INDEX IF NOT EXISTS daily_agent_metrics_chain_payer_idx ON daily_agent_metrics(chain, payer);

-- RLS Policies (if using Supabase auth)
-- execution_records: restrict to payer or admin
-- daily_agent_metrics: restrict to payer or admin
-- daily_chain_metrics: restrict to admin (operator dashboard)

-- View: daily_revenue (convenience view)
CREATE OR REPLACE VIEW daily_revenue AS
SELECT
  date,
  chain,
  request_count,
  total_fees_usd,
  settlement_success_rate,
  tier_breakdown
FROM daily_chain_metrics
ORDER BY date DESC, chain;

-- View: top_payers_lifetime (convenience view)
CREATE OR REPLACE VIEW top_payers_lifetime AS
SELECT
  payer,
  chain,
  COUNT(DISTINCT date) as days_active,
  SUM(request_count) as total_requests,
  SUM(total_fees_usd) as total_fees_usd,
  AVG(avg_latency_ms) as avg_latency_ms,
  AVG(success_rate) as avg_success_rate
FROM daily_agent_metrics
GROUP BY payer, chain
ORDER BY total_fees_usd DESC;
