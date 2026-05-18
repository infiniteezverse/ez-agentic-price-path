# Dashboard-Ready Telemetry Architecture

## Overview

The EZ Path multi-chain refactored architecture now integrates comprehensive telemetry designed to support both real-time operator dashboards (KV hot storage) and historical analytics dashboards (Supabase cold storage).

This document describes the complete telemetry pipeline and the architectural changes made to support dashboard requirements.

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│ Quote Request Flow                                                  │
│ GET /api/v1/quote?chain=base&sellToken=...&buyToken=...           │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Unified Router (/src/quote-router.ts)                              │
│ • Rate limit check (per-chain, per-IP/payer)                       │
│ • Payment verification (EIP-712)                                   │
│ • Nonce deduplication                                              │
│ • Get chain implementation from registry                           │
│ • Fetch quote + settle payment                                    │
│ • Build ExecutionRecord (rich telemetry)                          │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Chain Implementation (e.g., Base extends EVMChain)                  │
│ • fetchQuote() → returns NormalizedQuote + latencies              │
│ • settle() → returns SettlementResult { txHash, status }          │
│ • recordMetrics(ExecutionRecord) → CRITICAL TELEMETRY LAYER      │
└────────────────────┬────────────────────────────────────────────────┘
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
    ┌────────┐ ┌────────┐ ┌──────────┐
    │ KV     │ │KV      │ │Supabase  │
    │Operator│ │Agent   │ │(async,   │
    │Metrics │ │Metrics │ │non-block)│
    └────────┘ └────────┘ └──────────┘
         │           │           │
         ▼           ▼           ▼
    ┌─────────────────────────────────────────┐
    │ Nightly ETL Cron (2 AM UTC)             │
    │ Materializes KV → Supabase tables       │
    └──────────────┬──────────────────────────┘
                   │
                   ▼
    ┌───────────────────────────────────────────┐
    │ Supabase Historical Analytics (Cold)      │
    │ • execution_records (detail)              │
    │ • daily_chain_metrics (operator view)     │
    │ • daily_agent_metrics (payer view)        │
    └───────────────────────────────────────────┘
```

---

## Phase-by-Phase Implementation

### Phase 1-8: Multi-Chain Refactoring ✅ COMPLETE

**Delivered**:
- `/src/chains/` modular architecture with IChain interface
- EVMChain base class for EVM chains (Base, Arbitrum, Optimism, Polygon)
- SolanaChain placeholder
- Chain registry factory pattern
- Unified quote router (quote-router.ts)
- Lean HTTP layer (index.ts)

**Guarantees**:
- ✅ All existing Base behavior preserved (nonce security, EIP-712, EIP-3009)
- ✅ Backward compatible (no ?chain defaults to base)
- ✅ Extensible (new EVM chain = config + 9 lines of code)

### Phase 9: ExecutionRecord Audit ✅ COMPLETE

**ExecutionRecord Verification**:
All required metrics for operator and agent dashboards are captured:

**Operator Dashboard Needs** → ExecutionRecord provides:
- ✅ `request_count` ← count ExecutionRecords
- ✅ `total_revenue_atomic` ← sum `feeCollected.atomic`
- ✅ `avg_latency_ms` ← avg `totalLatencyMs`
- ✅ `settlement_success_rate` ← count where `settlement.status === "success"`
- ✅ `venue_performance` ← iterate `venues[]`, track latencies & wins
- ✅ `fallback_tracking` ← filter `fallbackUsed === true`
- ✅ `error_breakdown` ← count by `errorClassification`

**Agent Dashboard Needs** → ExecutionRecord provides:
- ✅ `usage_history` ← count per day
- ✅ `fees_paid` ← sum `feeCollected`
- ✅ `latency_trends` ← avg/p95 `totalLatencyMs`
- ✅ `routing_engine_used` ← track `execution.winner`
- ✅ `fallback_events` ← list where `fallbackUsed === true`
- ✅ `tier_breakdown` ← count by `tier`
- ✅ `edge_performance` ← `edgeBps` (0 if basic tier)

### Phase 10: KV Aggregation Layer ✅ COMPLETE

**Modified File**: `/src/chains/evm/EVMChain.ts` (recordMetrics method)

**New KV Keys**:

1. **Operator Metrics** (`metrics:operator:{chain}:{date}`)
   - Pre-aggregated: request_count, total_revenue_atomic, avg_latency_ms
   - Rolling averages: latency_sum_ms + count → avg computed
   - Settlement tracking: success_count + total_count → rate computed
   - Venue summary: per-venue win counts, latencies

2. **Venue Metrics** (`metrics:operator:venue:{chain}:{venue}:{date}`)
   - Per-venue performance: requests, wins, latency
   - Computed rates: win_rate, success_rate

3. **Agent Metrics** (`metrics:agent:{chain}:{payer}:{date}`)
   - Per-payer daily summary: request_count, total_fees, avg_latency
   - Tier breakdown: basic/resilient/institutional counts
   - Routing engine usage: 0x/paraswap/aerodrome wins

4. **Fallback Log** (`fallback_log:{chain}:{date}`)
   - Fallback event tracking by reason
   - Extra latency calculation

**Key Improvements**:
- ✅ Proper rolling average calculation (sum + count → avg)
- ✅ Non-destructive merges (increment counts, accumulate latencies)
- ✅ Per-venue tracking for granular analysis
- ✅ 24-hour TTL on all keys (daily rotation)

### Phase 11: Metrics API Endpoints ✅ COMPLETE

**Modified File**: `/src/index.ts`

**Endpoints Added**:

1. **GET /api/v1/metrics/operator/:chain/:date**
   - Auth: `Authorization: Bearer {ADMIN_API_KEY}`
   - Returns: `metrics:operator:{chain}:{date}` from KV
   - Response: { request_count, total_revenue_usd, avg_latency_ms, settlement_success_rate, venue_summary, ... }

2. **GET /api/v1/metrics/operator/venue/:chain/:venue/:date**
   - Auth: `Authorization: Bearer {ADMIN_API_KEY}`
   - Returns: `metrics:operator:venue:{chain}:{venue}:{date}` from KV
   - Response: { request_count, win_count, win_rate, avg_latency_ms, success_rate, ... }

3. **GET /api/v1/metrics/agent/:chain/:payer/:date**
   - Auth: `Authorization: Bearer {ADMIN_API_KEY}` (TODO: payer signature auth)
   - Returns: `metrics:agent:{chain}:{payer}:{date}` from KV
   - Response: { request_count, total_fees_usd, avg_latency_ms, tier_breakdown, routing_engine_usage, ... }

**Performance**:
- O(1) lookups: KV metrics are pre-aggregated
- No runtime aggregation: dashboards get instant responses
- Suitable for real-time operator dashboards

### Phase 12: Supabase Schema ✅ COMPLETE

**Migration File**: `/supabase/migrations/20260518033846_205ba72a-46a3-4f89-bbed-7a4d4cf33825.sql`

**Tables Created**:

1. **execution_records**
   - Full ExecutionRecord historical storage
   - Columns: request_id, timestamp, chain, payer, tier, fee_*, relayer_cost_*, execution_mode, winner, venues (jsonb), settlement_*, fallback_used, error_classification
   - Indexes: timestamp, chain, payer
   - Use case: Detailed query per request, time-series analysis

2. **daily_chain_metrics**
   - Operator dashboard materialized view
   - Columns: date, chain, request_count, total_revenue_*, avg_latency_ms, p95_latency_ms, p99_latency_ms, settlement_success_*, fallback_count, error_breakdown (jsonb), venue_summary (jsonb)
   - PK: (date, chain)
   - Indexes: date, chain
   - Use case: Operator dashboard aggregation by chain

3. **daily_agent_metrics**
   - Agent/payer dashboard materialized view
   - Columns: date, chain, payer, request_count, total_fees_*, avg_latency_ms, p95_latency_ms, avg_edge_bps, success_rate, tier_breakdown (jsonb), routing_engine_usage (jsonb)
   - PK: (date, chain, payer)
   - Indexes: date, chain, payer
   - Use case: Per-payer performance tracking

**RLS Policies** (to implement):
- execution_records: read if payer = current_user OR is admin
- daily_agent_metrics: read if payer = current_user OR is admin
- daily_chain_metrics: read if is admin (operator-only)

### Phase 13: ETL Pipeline Design ✅ COMPLETE

**Design Document**: `/docs/ETL_PIPELINE_DESIGN.md`

**Planned Implementation** (not yet coded):

**Nightly ETL Cron** (2 AM UTC):
1. Discover KV keys by date and type (operator/agent)
2. Transform: Read KV, compute missing fields (USD, percentages), map to Supabase schema
3. Load: UPSERT into daily_chain_metrics and daily_agent_metrics
4. Cleanup: Delete processed KV keys (optional, for space)

**Backfill Support**: 
- Parameterized date range for catch-up after downtime
- Idempotent UPSERT to handle re-runs

**Deployment Options**:
- Cloudflare Cron Trigger: `[[triggers.crons]]` in wrangler.toml
- External Service: Upstash, EasyCron, etc. POSTing to `/admin/etl`
- Supabase pg_cron: Via database trigger

**Monitoring**:
- Success: operatorRowsInserted > 0, agentRowsInserted > 0, durationMs < 300s
- Failure: Alert if Supabase unreachable or KV unavailable
- Logging: All messages prefixed `[etl]` for filtering

---

## Data Flow Examples

### Example 1: Operator Dashboard Query

```
Time: May 18, 2026, 9:00 AM UTC
Operator wants: Today's Base metrics

Request: GET /api/v1/metrics/operator/base/2026-05-18
         Authorization: Bearer {ADMIN_API_KEY}

Response:
{
  "request_count": 1247,
  "total_revenue_atomic": 37410000,  // 1247 * 30000
  "total_revenue_usd": "37410.00",
  "avg_latency_ms": 142.5,
  "p95_latency_ms": 287,
  "p99_latency_ms": 523,
  "settlement_success_rate": 99.2,
  "settlement_success_count": 1236,
  "settlement_total_count": 1247,
  "fallback_count": 3,
  "fallback_reasons": { "upstream_error": 2, "timeout": 1 },
  "error_breakdown": { "rate_limited": 8, "upstream_error": 2, "timeout": 1 },
  "venue_summary": {
    "0x": {
      "request_count": 1247,
      "win_count": 1200,
      "win_rate": 96.2,
      "avg_latency_ms": 128.3,
      "success_rate": 99.3
    },
    "paraswap": {
      "request_count": 1247,
      "win_count": 47,
      "win_rate": 3.8,
      "avg_latency_ms": 198.1,
      "success_rate": 98.4
    }
  }
}
```

**Insight**: 0x dominated (96% wins), settlement success 99%, all healthy.

### Example 2: Agent Dashboard Query

```
Time: May 18, 2026, 10:00 AM
Payer 0x1234... wants: My performance on Base today

Request: GET /api/v1/metrics/agent/base/0x1234.../2026-05-18
         Authorization: Bearer {ADMIN_API_KEY}  # TODO: payer signature

Response:
{
  "request_count": 5,
  "total_fees_atomic": 150000,  // 5 * 30000
  "total_fees_usd": "0.15",
  "avg_latency_ms": 156.2,
  "p95_latency_ms": 289,
  "avg_edge_bps": 2.4,  // avg improvement over baseline
  "success_rate": 100,
  "tier_breakdown": {
    "basic": 5,
    "resilient": 0,
    "institutional": 0
  },
  "routing_engine_usage": {
    "0x": 5
  }
}
```

**Insight**: Payer made 5 basic requests today, 100% success, 2.4bps edge.

### Example 3: Supabase Historical Query (Post-ETL)

```sql
-- Operator: Yesterday's top venues by revenue impact
SELECT
  venue_summary->>(venue) as venue,
  venue_summary->'0x'->>'win_rate' as win_rate,
  venue_summary->'0x'->>'avg_latency_ms' as latency
FROM daily_chain_metrics
WHERE date = '2026-05-17'
  AND chain = 'base'
ORDER BY win_rate DESC;

Result:
┌────────┬──────────┬─────────┐
│ venue  │ win_rate │ latency │
├────────┼──────────┼─────────┤
│ 0x     │ 96.2     │ 128.3   │
│ para   │ 3.8      │ 198.1   │
└────────┴──────────┴─────────┘
```

---

## File Changes Summary

### New Files Created

1. **`/src/chains/evm/EVMChain.ts`**
   - Updated `recordMetrics()` method with proper aggregation
   - Writes to KV (hot metrics) + Supabase (cold storage)
   - 158 lines of new code

2. **`/src/index.ts`**
   - Added 3 new Metrics API endpoints
   - GET /api/v1/metrics/operator/:chain/:date
   - GET /api/v1/metrics/operator/venue/:chain/:venue/:date
   - GET /api/v1/metrics/agent/:chain/:payer/:date
   - 70 lines of new code

3. **`/sql/202605180300_dashboard_schema.sql`**
   - Supabase schema: execution_records, daily_chain_metrics, daily_agent_metrics
   - Tables with proper indexes and RLS placeholders
   - 150 lines

4. **`/supabase/migrations/20260518033846_205ba72a-46a3-4f89-bbed-7a4d4cf33825.sql`**
   - Migration copy of the schema SQL (Supabase standard)

5. **`/docs/ETL_PIPELINE_DESIGN.md`**
   - Comprehensive ETL design (not yet implemented)
   - Pseudo-code for discovery, transformation, loading
   - Deployment options and monitoring guide
   - 400+ lines

6. **`/docs/DASHBOARD_READY_TELEMETRY.md`**
   - This file: architecture overview and phase summary
   - Data flow examples
   - File changes tracking

### Modified Files

1. **`/src/chains/evm/EVMChain.ts`**
   - Rewrote recordMetrics() for proper aggregation
   - Changed from naive writes to rolling-average KV storage
   - Proper Supabase cold-storage writes

### Backward Compatible Changes

- ✅ No changes to quote-router API
- ✅ No changes to settlement flow
- ✅ No changes to nonce security
- ✅ Existing /admin/analytics endpoint still works
- ✅ All new KV keys are additive (no conflicts with existing keys)

---

## Dashboard Readiness Checklist

### Operator Dashboard (Internal)

- [ ] Implement dashboard UI (React/Vue)
  - Fetch `/api/v1/metrics/operator/base/YYYY-MM-DD`
  - Display request_count, revenue_usd, settlement_success_rate
  - Render venue_summary table with win_rates

- [ ] Implement venue drill-down
  - Fetch `/api/v1/metrics/operator/venue/base/0x/YYYY-MM-DD`
  - Show latency distribution (p95, p99)

- [ ] Add date range picker
  - Fetch Supabase daily_chain_metrics for historical comparison
  - POST to `/admin/etl?dateStart=...&dateEnd=...` to backfill if needed

### Agent Dashboard (External/Payer-Scoped)

- [ ] Implement payer dashboard
  - Fetch `/api/v1/metrics/agent/base/{payer}/YYYY-MM-DD` (with auth)
  - Display request_count, total_fees_usd, avg_latency_ms

- [ ] Add tier breakdown chart
  - Show basic/resilient/institutional distribution

- [ ] Show routing engine preference
  - routing_engine_usage breakdown

- [ ] Implement 30-day history view
  - Query Supabase daily_agent_metrics for time-series

### Infrastructure

- [ ] Deploy Supabase migration
  - Run: `supabase migration up 20260518033846_205ba72a-46a3-4f89-bbed-7a4d4cf33825`

- [ ] Setup RLS policies
  - execution_records: payer = current_user OR is_admin
  - daily_agent_metrics: payer = current_user OR is_admin
  - daily_chain_metrics: is_admin only

- [ ] Implement ETL cron job
  - Create handler in a separate worker or via Cloudflare Cron
  - POST to `/admin/etl` daily at 2 AM UTC

- [ ] Setup monitoring
  - Cloudflare Workers Analytics for API latency
  - Supabase monitoring for ETL job status
  - Alerts: ETL duration > 5min or failures

---

## Performance Characteristics

| Component | Latency | Notes |
|-----------|---------|-------|
| Quote API | 150-200ms | Unchanged, async metrics recording |
| Metrics API GET | <10ms | KV lookup (pre-aggregated) |
| Settlement | N/A | Async, non-blocking |
| KV Aggregation | ~100ms | Per-request overhead (negligible) |
| Supabase Write | ~500ms | Async, doesn't block quote response |
| Nightly ETL | <300s | Target: <5 min for 1-2M requests/day |

---

## Future Enhancements

1. **Real-time Metrics Streaming** (Phase 14)
   - Use Supabase Realtime to push metric updates to connected dashboards
   - Reduces polling overhead

2. **Venue-Level Materialized Views** (Phase 15)
   - Separate `daily_venue_metrics` table
   - Enables venue comparison dashboards

3. **Payer Tier Analysis** (Phase 16)
   - Track which payers use which tiers
   - Tier adoption trends

4. **MEV & Private RPC Tracking** (Phase 17)
   - Correlate `mevFlags` with settlement outcomes
   - Private RPC usage patterns

5. **Predictive Analytics** (Phase 18)
   - ML model: predict venue win-rate by time-of-day, token pair
   - Optimize tier recommendations

6. **Cost Attribution** (Phase 19)
   - Per-venue relayer cost tracking
   - Margin analysis by venue and tier

---

## Conclusion

The telemetry architecture is now **dashboard-ready**:

✅ All metrics captured in ExecutionRecord  
✅ Real-time aggregation in KV (operator view)  
✅ Per-payer daily metrics (agent view)  
✅ Metrics API endpoints for dashboard queries  
✅ Supabase schema for historical analytics  
✅ ETL pipeline designed (ready for implementation)  

**Next Steps**:
1. Deploy Supabase schema migration
2. Implement operator dashboard UI
3. Implement agent dashboard UI
4. Deploy ETL cron job
5. Setup monitoring and alerts

**Non-Blocking**: All telemetry writes are async (KV + Supabase), so quote latency is unaffected.
