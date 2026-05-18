# ETL Pipeline Testing Guide

## Quick Test Checklist

After deploying the ETL pipeline, follow these steps to verify it works end-to-end:

### 1. Verify Supabase Tables Exist

```bash
# Check schema in Supabase dashboard:
# Go to: https://app.supabase.com/project/btqxheoeucydudnwlhxa/editor
# Confirm these tables exist:
# - execution_records (23 columns)
# - daily_chain_metrics (14 columns)
# - daily_agent_metrics (13 columns)
```

### 2. Deploy Updated Code

```bash
cd /Users/tylermiller/dev/ez-path
npx wrangler deploy
```

**Verify output**:
- ✅ No errors during deployment
- ✅ Worker deployed to `ezpath.myezverse.xyz`
- ✅ Scheduled trigger shows `0 2 * * *`

### 3. Manually Trigger ETL (Test Run)

```bash
# Get your ADMIN_API_KEY from Cloudflare environment variables
export ADMIN_API_KEY="<your-key>"

# Trigger ETL
curl -X POST https://ezpath.myezverse.xyz/admin/etl \
  -H "Authorization: Bearer ${ADMIN_API_KEY}" \
  -H "Content-Type: application/json"
```

**Expected Response** (success):
```json
{
  "success": true,
  "stats": {
    "targetDate": "2026-05-17",
    "operatorMetricsLoaded": 5,
    "operatorMetricsUpserted": 5,
    "agentMetricsLoaded": 23,
    "agentMetricsUpserted": 23,
    "fallbackLogsLoaded": 0,
    "fallbackLogsUpserted": 0,
    "kvKeysDeleted": 0,
    "errors": [],
    "durationMs": 1523
  }
}
```

**Expected Response** (no data):
```json
{
  "success": true,
  "stats": {
    "targetDate": "2026-05-17",
    "operatorMetricsLoaded": 0,
    "operatorMetricsUpserted": 0,
    "agentMetricsLoaded": 0,
    "agentMetricsUpserted": 0,
    "fallbackLogsLoaded": 0,
    "fallbackLogsUpserted": 0,
    "kvKeysDeleted": 0,
    "errors": [],
    "durationMs": 342
  }
}
```

(If no data is loaded, it means there were no quote requests yesterday, which is normal in early testing.)

### 4. Verify Data in Supabase

#### 4a. Check daily_chain_metrics table

```bash
# In Supabase SQL Editor, run:
SELECT * FROM daily_chain_metrics 
ORDER BY date DESC, chain 
LIMIT 10;
```

**Expected Output**:
```
date       | chain | request_count | total_revenue_usd | avg_latency_ms | ...
2026-05-17 | base  | 5             | 0.15              | 234            | ...
```

#### 4b. Check daily_agent_metrics table

```bash
SELECT * FROM daily_agent_metrics 
ORDER BY date DESC, chain, payer 
LIMIT 10;
```

**Expected Output**:
```
date       | chain | payer          | request_count | total_fees_usd | avg_latency_ms | ...
2026-05-17 | base  | 0x123...       | 2             | 0.06           | 245            | ...
```

#### 4c. Verify aggregates match

```bash
-- Operator total requests
SELECT SUM(request_count) as total_requests
FROM daily_chain_metrics 
WHERE date = '2026-05-17';

-- Agent total requests (should match operator)
SELECT SUM(request_count) as total_requests
FROM daily_agent_metrics 
WHERE date = '2026-05-17';
```

(Both totals should match, assuming no data loss in transformation.)

### 5. Generate Test Data (Optional)

If you want to test with fresh data:

#### Option A: Make Real Quote Requests

```bash
# Make a quote request to populate KV metrics
curl "https://ezpath.myezverse.xyz/api/v1/quote" \
  -H "X-Payment: <base64-payment-header>" \
  -H "X-Sell-Token: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" \
  -H "X-Buy-Token: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" \
  -H "X-Sell-Amount: 1000000"
```

Make 5–10 requests from different payers to create realistic KV data. Then trigger ETL.

#### Option B: Manual KV Insertion (Advanced)

```bash
# Insert a test metric into KV (simulates yesterday's date)
YESTERDAY=$(date -u -d yesterday +%Y-%m-%d)

# Create operator metric
wrangler kv:key put "metrics:operator:base:${YESTERDAY}" \
  '{"request_count": 10, "total_revenue_atomic": 300000, "total_revenue_usd": "0.30", "avg_latency_ms": 200, "settlement_success_rate": 100, "settlement_success_count": 10, "settlement_total_count": 10, "fallback_count": 0}' \
  --namespace-id 2fdd6978310a44a18ff0e34da538c9a0

# Then trigger ETL
curl -X POST https://ezpath.myezverse.xyz/admin/etl \
  -H "Authorization: Bearer ${ADMIN_API_KEY}"
```

### 6. Monitor Scheduled Trigger

```bash
# Watch logs in real-time (useful at 2 AM UTC on any day)
wrangler tail ezpath-router

# You should see output like:
# [scheduled] ETL pipeline completed: { success: true, stats: { ... } }
```

## Test Scenarios

### Scenario 1: No Data (Normal in Early Testing)

**Setup**: No quote requests made recently

**Expected**: ETL returns success but with 0 metrics loaded

**Verification**:
```bash
curl -X POST https://ezpath.myezverse.xyz/admin/etl \
  -H "Authorization: Bearer ${ADMIN_API_KEY}"

# Response: { success: true, stats: { operatorMetricsLoaded: 0, ... } }
```

### Scenario 2: With Data (Post-Deployment)

**Setup**: 10+ quote requests made in past 24h

**Expected**: ETL loads and upserts metrics

**Verification**:
```bash
# Trigger ETL
curl -X POST https://ezpath.myezverse.xyz/admin/etl \
  -H "Authorization: Bearer ${ADMIN_API_KEY}"

# Response: { success: true, stats: { operatorMetricsLoaded: 5, ... } }

# Check Supabase
SELECT COUNT(*) FROM daily_chain_metrics WHERE date = '2026-05-17';
# Expected: 1–5 rows (one per chain used)
```

### Scenario 3: Idempotent Upsert

**Setup**: Run ETL twice on same date

**Expected**: Second run doesn't duplicate rows, overwrites with same data

**Verification**:
```bash
# Run 1
curl -X POST https://ezpath.myezverse.xyz/admin/etl \
  -H "Authorization: Bearer ${ADMIN_API_KEY}"
# { success: true, operatorMetricsUpserted: 5 }

# Wait 5 seconds

# Run 2
curl -X POST https://ezpath.myezverse.xyz/admin/etl \
  -H "Authorization: Bearer ${ADMIN_API_KEY}"
# { success: true, operatorMetricsUpserted: 5 } (same count, rows overwritten)

# Check Supabase row count
SELECT COUNT(*) FROM daily_chain_metrics WHERE date = '2026-05-17';
# Expected: Still 1–5 rows (no duplicates)
```

### Scenario 4: Error Handling

**Setup**: Simulate Supabase auth error

**Steps**:
1. Temporarily set `SUPABASE_SERVICE_ROLE_KEY` to an invalid value
2. Trigger ETL

**Expected**: Returns success: false, with error message in stats.errors

**Verification**:
```bash
curl -X POST https://ezpath.myezverse.xyz/admin/etl \
  -H "Authorization: Bearer ${ADMIN_API_KEY}"

# Response: { success: false, stats: { errors: ["Supabase upsert failed: 401 Unauthorized"] } }
```

## Automated Trigger Testing

To verify the scheduled trigger fires at 2 AM UTC:

```bash
# Check Cloudflare Worker settings
wrangler triggers list

# Should show:
# Trigger Type | Value
# scheduled    | 0 2 * * *
```

At 2 AM UTC, check logs:
```bash
wrangler tail ezpath-router --follow

# You should see:
# [scheduled] ETL pipeline completed: { success: true, stats: { ... } }
```

Or check Supabase for fresh entries:
```bash
# In Supabase, query: SELECT * FROM daily_chain_metrics ORDER BY updated_at DESC LIMIT 1
# updated_at should be very recent (within last 5 minutes if at 2 AM UTC)
```

## Debugging Common Issues

### Issue: "Supabase upsert failed: 401 Unauthorized"

**Cause**: `SUPABASE_SERVICE_ROLE_KEY` is invalid

**Fix**:
```bash
# Get correct key from Supabase Settings → API
# Copy the "service_role" key

wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Paste the key when prompted
```

### Issue: "Supabase upsert failed: 500 Internal Server Error"

**Cause**: Schema mismatch or Supabase server error

**Fix**:
1. Verify schema exists: `wrangler tail ezpath-router` (look for actual error from Supabase)
2. Check Supabase status: https://status.supabase.com/
3. Verify column names match in ETL code vs. schema

### Issue: ETL Returns No Data But Quote Requests Were Made

**Cause**: KV keys don't match expected pattern

**Fix**:
```bash
# Check what keys are actually in KV
wrangler kv:key list --namespace-id 2fdd6978310a44a18ff0e34da538c9a0 | grep metrics

# If you see `usage:` or `revenue:` but not `metrics:operator:*`, 
# then recordMetrics() hasn't been called yet (check quote-router.ts implementation)
```

### Issue: Scheduled Trigger Doesn't Fire at 2 AM UTC

**Cause**: Trigger not properly configured or deployment failed

**Fix**:
```bash
# Redeploy
npx wrangler deploy

# Verify trigger is set
wrangler triggers list

# Check logs at 2 AM UTC (or use manual trigger to test)
wrangler tail ezpath-router
```

## Success Criteria Checklist

- [ ] Supabase schema deployed (3 tables + indexes exist)
- [ ] ETL code deployed (`/src/etl.ts` and `/src/index.ts` updated)
- [ ] Manual ETL trigger works: `POST /admin/etl` returns success
- [ ] Supabase receives data: `daily_chain_metrics` has rows
- [ ] Agent metrics present: `daily_agent_metrics` has rows
- [ ] Idempotency verified: Running ETL twice doesn't duplicate rows
- [ ] Scheduled trigger fires at 2 AM UTC (verify in logs)
- [ ] No errors in ETL pipeline logs
