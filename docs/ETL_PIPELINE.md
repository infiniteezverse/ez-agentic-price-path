# ETL Pipeline: KV → Supabase Nightly Aggregation

## Overview

The ETL (Extract, Transform, Load) pipeline automatically materializes real-time KV metrics into Supabase cold storage every night at **2 AM UTC** via Cloudflare Scheduled Cron Triggers.

**Data Flow**:
```
Quote Request
    ↓
ExecutionRecord emitted
    ↓
recordMetrics() writes hot KV storage (24-hour TTL)
    ├─ metrics:operator:{chain}:{date}
    ├─ metrics:agent:{chain}:{payer}:{date}
    └─ fallback_log:{chain}:{date}
    ↓
[2 AM UTC Cron Trigger]
    ↓
ETL Pipeline (5 phases)
    ├─ Phase 1: Discover yesterday's KV keys
    ├─ Phase 2: Load and parse KV data
    ├─ Phase 3: Transform and UPSERT to Supabase
    ├─ Phase 4: Cleanup old KV keys (30+ days)
    └─ Phase 5: Log completion/notify
    ↓
Supabase Tables Updated
    ├─ daily_chain_metrics (operator view)
    └─ daily_agent_metrics (agent/payer view)
    ↓
[Dashboards] read Supabase for historical analytics
```

## Architecture

### Scheduled Trigger

**Wrangler Configuration** (`wrangler.toml`):
```toml
[[triggers.scheduled]]
crons = ["0 2 * * *"]  # 2 AM UTC daily
```

**Handler** (`src/index.ts`):
```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const result = await handleETL(env, { waitUntil: (p: Promise<void>) => ctx.waitUntil(p) });
    console.log(`[scheduled] ETL pipeline completed:`, result);
  },
};
```

### ETL Handler (`src/etl.ts`)

**Main function**: `handleETL(env: Env, ctx?: any): Promise<{ success: boolean; stats: ETLStats }>`

**5-Phase Pipeline**:

#### Phase 1: Discover KV Keys
- Lists all KV entries
- Filters by target date (yesterday's date: YYYY-MM-DD)
- Separates into three categories:
  - `metrics:operator:*` (operator metrics)
  - `metrics:agent:*` (agent/payer metrics)
  - `fallback_log:*` (fallback events)

```
Input:  KV namespace (via list API with pagination)
Output: { operatorKeys[], agentKeys[], fallbackKeys[] }
```

#### Phase 2: Load and Parse
- Reads KV data for each key
- Parses JSON
- Extracts metadata (chain, payer) from key names
- Returns typed rows for each category

```
Input:  Key arrays from Phase 1
Output: OperatorMetricRow[], AgentMetricRow[], FallbackLogRow[]
```

#### Phase 3: Transform and UPSERT
- Maps KV data to Supabase table schemas
- Uses Supabase REST API with `Prefer: resolution=merge-duplicates` header (UPSERT behavior)
- Separate writes for each table:
  - `POST /rest/v1/daily_chain_metrics` (operator metrics)
  - `POST /rest/v1/daily_agent_metrics` (agent metrics)
  - Fallback logs merged into operator metrics

```
Input:  Metric rows
Output: Supabase rows inserted/updated
Side Effect: 3 tables updated, each row contains yesterday's aggregates
```

#### Phase 4: Cleanup Old Keys
- Identifies KV keys older than 30 days
- Deletes them (TTL already handles expiration, this is cleanup)
- Frees up KV storage quota

```
Input:  All KV keys discovered in Phase 1
Output: Deleted count
```

#### Phase 5: Log and Notify
- Logs completion timestamp and stats
- Optional: sends notification to Slack/Discord/email
- Returns ETLStats for monitoring

```
Input:  ETL result, total duration
Output: Completion event logged, optional external notification sent
```

### Data Types

**ETLStats** (returned at completion):
```typescript
{
  targetDate: "2026-05-18",           // Yesterday's date
  operatorMetricsLoaded: 5,           // Chains processed
  operatorMetricsUpserted: 5,         // Rows written to Supabase
  agentMetricsLoaded: 23,             // Payer-chain combos
  agentMetricsUpserted: 23,           // Rows written to Supabase
  fallbackLogsLoaded: 2,              // Chains with fallback events
  fallbackLogsUpserted: 2,            // Merged into operator metrics
  kvKeysDeleted: 142,                 // Cleanup: keys older than 30 days
  errors: [],                         // Any errors during pipeline
  durationMs: 1523                    // Total time to completion
}
```

**OperatorMetricRow** (from metrics:operator:{chain}:{date}):
```typescript
{
  date: "2026-05-18",
  chain: "base",
  request_count: 1523,
  total_revenue_atomic: 45690000,    // 45.69 USDC
  total_revenue_usd: "45.69",
  avg_latency_ms: 234,
  p95_latency_ms: 567,
  p99_latency_ms: 890,
  settlement_success_rate: 99.5,
  settlement_success_count: 1515,
  settlement_total_count: 1523,
  fallback_count: 8,
  fallback_reasons: { "timeout": 5, "all_venues_failed": 3 },
  error_breakdown: { "rate_limited": 2, "upstream_error": 0 },
  venue_summary: {
    "0x": { requests: 512, win_count: 256, win_rate: 50.0, avg_latency_ms: 200 },
    "paraswap": { requests: 512, win_count: 256, win_rate: 50.0, avg_latency_ms: 240 }
  }
}
```

**AgentMetricRow** (from metrics:agent:{chain}:{payer}:{date}):
```typescript
{
  date: "2026-05-18",
  chain: "base",
  payer: "0x1234...5678",
  request_count: 42,
  total_fees_atomic: 1260000,        // 1.26 USDC
  total_fees_usd: "1.26",
  avg_latency_ms: 245,
  p95_latency_ms: 580,
  avg_edge_bps: 15,                  // 0.15% advantage vs next-best venue
  success_rate: 100.0,
  tier_breakdown: { "basic": 20, "resilient": 15, "institutional": 7 },
  routing_engine_usage: { "0x": 21, "paraswap": 21 }
}
```

## Deployment

### Prerequisites

✅ Supabase schema deployed (3 tables + indexes created)
✅ `SUPABASE_SERVICE_ROLE_KEY` set in Cloudflare environment
✅ `METERING` KV namespace accessible from Workers

### Deploy Steps

1. **Deploy to Cloudflare**:
   ```bash
   cd /Users/tylermiller/dev/ez-path
   npx wrangler deploy
   ```

2. **Verify scheduled trigger is active**:
   - Go to Cloudflare dashboard → Workers → ezpath-router
   - Under "Triggers", confirm "Scheduled" shows `0 2 * * *` (2 AM UTC daily)

3. **Test manually** (optional):
   ```bash
   curl -X POST https://ezpath.myezverse.xyz/admin/etl \
     -H "Authorization: Bearer ${ADMIN_API_KEY}"
   ```
   Response:
   ```json
   {
     "success": true,
     "stats": {
       "targetDate": "2026-05-17",
       "operatorMetricsLoaded": 5,
       "operatorMetricsUpserted": 5,
       ...
     }
   }
   ```

### Schedule

- **Trigger Time**: 2 AM UTC daily
- **Duration**: ~1–5 seconds (most of time is Supabase network latency)
- **Success Rate**: Must be 100% (no tolerance for ETL failures)
- **Backfill Window**: If ETL fails, next run will re-process yesterday's data (idempotent UPSERT)

### Monitoring

**Logs**:
- Cloudflare Workers Logs: `wrangler tail ezpath-router`
- Supabase Activity: Query `daily_chain_metrics` and `daily_agent_metrics` for latest date

**Alerting** (Future):
- Monitor `durationMs > 30_000` (timeout threshold)
- Monitor `errors.length > 0` (any pipeline error)
- Slack webhook on failure

## Manual Execution

### Endpoint: `POST /admin/etl`

**Authentication**: Requires `Authorization: Bearer ${ADMIN_API_KEY}` header

**Response** (success):
```json
{
  "success": true,
  "stats": {
    "targetDate": "2026-05-18",
    "operatorMetricsLoaded": 5,
    "operatorMetricsUpserted": 5,
    "agentMetricsLoaded": 42,
    "agentMetricsUpserted": 42,
    "fallbackLogsLoaded": 0,
    "fallbackLogsUpserted": 0,
    "kvKeysDeleted": 12,
    "errors": [],
    "durationMs": 1234
  }
}
```

**Response** (failure):
```json
{
  "success": false,
  "stats": {
    "targetDate": "2026-05-18",
    "operatorMetricsLoaded": 5,
    "operatorMetricsUpserted": 3,
    "errors": ["Supabase upsert failed: 500 Internal Server Error"],
    "durationMs": 5000
  }
}
```

## Idempotency & Backfill

The ETL pipeline is **idempotent** — running it multiple times on the same date produces the same result:

1. **UPSERT Logic**: Supabase REST API with `Prefer: resolution=merge-duplicates` replaces existing rows with the same PK (date, chain) or (date, chain, payer)
2. **Backfill**: If a day's ETL fails or is skipped, re-running for that date will correctly materialize metrics
3. **Example**: If May 18 ETL fails at 2:02 AM, running `POST /admin/etl` at 3 PM will materialize May 17's metrics (yesterday from 3 PM perspective) or allow manual specification of target date (future enhancement)

## KV Cleanup & Retention

**Retention Policy**:
- KV records: 24-hour TTL (automatically expire via Cloudflare)
- ETL cleanup: Deletes keys older than 30 days (safety net)
- Supabase records: Indefinite (cold storage for analytics)

**Example Timeline**:
```
Day 1: metrics:operator:base:2026-05-01 written, 24h TTL
Day 2: (still in KV, auto-expires at end of day)
...
Day 30: ETL sees this key, qualifies for cleanup (30+ days old)
Day 30 ETL: Deletes metrics:operator:base:2026-05-01 from KV
       But Supabase still has the row in daily_chain_metrics for 2026-05-01
```

## Future Enhancements

1. **Monitoring & Alerts**:
   - Slack webhook on ETL failure
   - CloudWatch metrics for duration, error count
   - PagerDuty alert if ETL doesn't complete by 2:15 AM

2. **Backfill Support**:
   - Add `?date=YYYY-MM-DD` parameter to `/admin/etl` to backfill specific dates
   - Bulk backfill for date ranges

3. **Supabase Materialized Views**:
   - Add `hourly_*` aggregates (not just daily)
   - Add `weekly_*` and `monthly_*` summaries

4. **External Notifications**:
   - Discord webhook with daily metrics summary
   - Email digest for ops team

5. **Performance Optimization**:
   - Batch Supabase writes (POST with 100 rows per request instead of one at a time)
   - Parallel phase execution (discover + load in parallel)

## Troubleshooting

### ETL Hangs (> 30 seconds)

**Symptoms**: `/admin/etl` request times out

**Causes**:
- Supabase API is slow or down
- KV list API is paginating through millions of keys
- Network latency to Supabase project

**Fix**:
- Check Supabase status: https://status.supabase.com/
- Check Cloudflare status: https://www.cloudflarestatus.com/
- Increase Wrangler timeout in `wrangler.toml` (if possible)

### ETL Errors in Logs

**Symptom**: `errors: ["Supabase upsert failed: 401 Unauthorized"]`

**Cause**: `SUPABASE_SERVICE_ROLE_KEY` is invalid or missing

**Fix**:
```bash
# Verify the key is set in Cloudflare environment
wrangler secret list

# If missing, add it:
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Paste the key when prompted (from Supabase Settings → API)
```

### No Data in daily_chain_metrics

**Symptom**: Table is empty or stale

**Cause**: ETL hasn't run yet, or KV has no metrics for target date

**Fix**:
- Manually trigger: `POST /admin/etl`
- Check KV contents: `wrangler kv:key list | grep metrics:operator`
- Verify quote requests are hitting the endpoint (check quote logs)

## Files

| File | Purpose |
|------|---------|
| `/src/etl.ts` | ETL handler (5-phase pipeline) |
| `/src/index.ts` | HTTP handler + scheduled trigger export |
| `/wrangler.toml` | Scheduled cron trigger config |
| `/docs/ETL_PIPELINE.md` | This file |
| `/supabase/migrations/20260518033846_*.sql` | Supabase schema |
