# KV → Supabase ETL Pipeline Design

## Overview

Nightly cron job that materializes real-time KV metrics (hot storage) into Supabase historical tables (cold storage) for long-term analytics and dashboard queries.

**Schedule**: 2 AM UTC daily  
**Idempotency**: UPSERT on (date, chain[, payer])  
**Backfill Support**: Parameterized date range for catch-up runs  
**Monitoring**: Alerts if ETL exceeds 5 minutes or fails

---

## KV Source Keys (Written by recordMetrics)

### Operator Metrics (Chain-level)
```
metrics:operator:{chain}:{YYYY-MM-DD}
├─ request_count: number
├─ total_revenue_atomic: number
├─ total_revenue_usd: string (computed from atomic)
├─ avg_latency_ms: number
├─ p95_latency_ms: number
├─ p99_latency_ms: number
├─ settlement_success_rate: number (0-100)
├─ settlement_success_count: number
├─ settlement_total_count: number
├─ fallback_count: number
├─ fallback_reasons: { reason: count }
├─ error_breakdown: { error_code: count }
└─ venue_summary: {
     "venue_name": {
       request_count,
       win_count,
       win_rate,
       avg_latency_ms,
       success_rate
     }
   }
```

### Venue Metrics (Venue-level)
```
metrics:operator:venue:{chain}:{venue}:{YYYY-MM-DD}
├─ request_count: number
├─ win_count: number
├─ win_rate: number (%)
├─ avg_latency_ms: number
├─ success_rate: number (%)
└─ error_breakdown: { error_code: count }
```

### Agent Metrics (Payer-scoped)
```
metrics:agent:{chain}:{payer}:{YYYY-MM-DD}
├─ request_count: number
├─ total_fees_atomic: number
├─ total_fees_usd: string
├─ avg_latency_ms: number
├─ p95_latency_ms: number
├─ avg_edge_bps: number
├─ success_rate: number (%)
├─ tier_breakdown: { basic: count, resilient: count, institutional: count }
└─ routing_engine_usage: { venue: count }
```

---

## Supabase Target Tables

### daily_chain_metrics
Maps from `metrics:operator:{chain}:{date}`

```sql
INSERT INTO daily_chain_metrics (
  date, chain, request_count, total_revenue_atomic, total_revenue_usd,
  avg_latency_ms, p95_latency_ms, p99_latency_ms,
  settlement_success_rate, settlement_success_count, settlement_total_count,
  fallback_count, fallback_reasons, error_breakdown, venue_summary
)
VALUES (...)
ON CONFLICT (date, chain) DO UPDATE SET
  request_count = EXCLUDED.request_count,
  total_revenue_atomic = EXCLUDED.total_revenue_atomic,
  -- ... all other columns
  updated_at = now()
```

### daily_agent_metrics
Maps from `metrics:agent:{chain}:{payer}:{date}`

```sql
INSERT INTO daily_agent_metrics (
  date, chain, payer, request_count, total_fees_atomic, total_fees_usd,
  avg_latency_ms, p95_latency_ms, avg_edge_bps,
  success_rate, tier_breakdown, routing_engine_usage
)
VALUES (...)
ON CONFLICT (date, chain, payer) DO UPDATE SET
  request_count = EXCLUDED.request_count,
  total_fees_atomic = EXCLUDED.total_fees_atomic,
  -- ... all other columns
  updated_at = now()
```

---

## ETL Job Pseudo-Code

### Phase 1: Discover KV Keys for Date Range

```typescript
async function discoverKVKeys(
  kv: KVNamespace,
  dateStart: string,  // "2026-05-18"
  dateEnd: string
): Promise<{
  operatorKeys: string[];
  venueKeys: string[];
  agentKeys: string[];
}> {
  const operatorKeys: string[] = [];
  const venueKeys: string[] = [];
  const agentKeys: string[] = [];

  // List all KV keys (paginated)
  let cursor: string | undefined;
  loop: while (true) {
    const result = await kv.list({
      prefix: "metrics:",
      cursor,
      limit: 1000,
    });

    for (const key of result.keys) {
      if (key.name.startsWith("metrics:operator:") && !key.name.includes(":venue:")) {
        // metrics:operator:{chain}:{date}
        const date = key.name.split(":")[3];
        if (date >= dateStart && date <= dateEnd) {
          operatorKeys.push(key.name);
        }
      }
      if (key.name.includes(":venue:")) {
        // metrics:operator:venue:{chain}:{venue}:{date}
        const date = key.name.split(":")[5];
        if (date >= dateStart && date <= dateEnd) {
          venueKeys.push(key.name);
        }
      }
      if (key.name.startsWith("metrics:agent:")) {
        // metrics:agent:{chain}:{payer}:{date}
        const date = key.name.split(":")[4];
        if (date >= dateStart && date <= dateEnd) {
          agentKeys.push(key.name);
        }
      }
    }

    if (!result.list_complete) {
      cursor = result.cursor;
    } else {
      break loop;
    }
  }

  return { operatorKeys, venueKeys, agentKeys };
}
```

### Phase 2: Transform and Load Operator Metrics

```typescript
async function transformOperatorMetrics(
  operatorKeys: string[],
  kv: KVNamespace,
  supabase: SupabaseClient
): Promise<number> {
  let inserted = 0;

  for (const key of operatorKeys) {
    const parts = key.split(":");
    const chain = parts[2];
    const date = parts[3];

    const rawData = await kv.get(key);
    if (!rawData) continue;

    const data = JSON.parse(rawData);

    const { error } = await supabase.from("daily_chain_metrics").upsert({
      date,
      chain,
      request_count: data.request_count,
      total_revenue_atomic: data.total_revenue_atomic,
      total_revenue_usd: (data.total_revenue_atomic / 1_000_000).toFixed(2),
      avg_latency_ms: data.avg_latency_ms,
      p95_latency_ms: data.p95_latency_ms,
      p99_latency_ms: data.p99_latency_ms,
      settlement_success_rate: data.settlement_success_rate,
      settlement_success_count: data.settlement_success_count,
      settlement_total_count: data.settlement_total_count,
      fallback_count: data.fallback_count,
      fallback_reasons: data.fallback_reasons,
      error_breakdown: data.error_breakdown,
      venue_summary: data.venue_summary,
    }, { onConflict: "date,chain" });

    if (error) {
      console.error(`[etl] failed to upsert operator metrics for ${date}/${chain}: ${error.message}`);
    } else {
      inserted++;
    }
  }

  return inserted;
}
```

### Phase 3: Transform and Load Agent Metrics

```typescript
async function transformAgentMetrics(
  agentKeys: string[],
  kv: KVNamespace,
  supabase: SupabaseClient
): Promise<number> {
  let inserted = 0;

  for (const key of agentKeys) {
    const parts = key.split(":");
    const chain = parts[2];
    const payer = parts[3];
    const date = parts[4];

    const rawData = await kv.get(key);
    if (!rawData) continue;

    const data = JSON.parse(rawData);

    const { error } = await supabase.from("daily_agent_metrics").upsert({
      date,
      chain,
      payer,
      request_count: data.request_count,
      total_fees_atomic: data.total_fees_atomic,
      total_fees_usd: (data.total_fees_atomic / 1_000_000).toFixed(2),
      avg_latency_ms: data.avg_latency_ms,
      p95_latency_ms: data.p95_latency_ms,
      avg_edge_bps: data.avg_edge_bps,
      success_rate: data.success_rate,
      tier_breakdown: data.tier_breakdown,
      routing_engine_usage: data.routing_engine_usage,
    }, { onConflict: "date,chain,payer" });

    if (error) {
      console.error(`[etl] failed to upsert agent metrics for ${date}/${chain}/${payer}: ${error.message}`);
    } else {
      inserted++;
    }
  }

  return inserted;
}
```

### Phase 4: Cleanup (Optional)

```typescript
async function cleanupOldKVMetrics(
  kv: KVNamespace,
  dateToDelete: string  // "2026-05-17"
): Promise<number> {
  let deleted = 0;

  // Delete operator metrics
  const operatorKey = `metrics:operator:*:${dateToDelete}`;
  // (KV doesn't support wildcard deletes, must list first)
  
  const result = await kv.list({ prefix: `metrics:operator:` });
  for (const key of result.keys) {
    if (key.name.endsWith(`:${dateToDelete}`)) {
      await kv.delete(key.name);
      deleted++;
    }
  }

  // Delete agent metrics
  const agentResult = await kv.list({ prefix: `metrics:agent:` });
  for (const key of agentResult.keys) {
    if (key.name.endsWith(`:${dateToDelete}`)) {
      await kv.delete(key.name);
      deleted++;
    }
  }

  console.log(`[etl] deleted ${deleted} KV keys for ${dateToDelete}`);
  return deleted;
}
```

### Phase 5: Main ETL Handler

```typescript
export async function runETL(
  env: Env,
  ctx: ExecutionContext,
  options?: {
    dateStart?: string;  // defaults to yesterday
    dateEnd?: string;    // defaults to yesterday
    skipCleanup?: boolean;
  }
): Promise<{
  status: "success" | "failed";
  operatorRowsInserted: number;
  agentRowsInserted: number;
  durationMs: number;
}> {
  const startTime = Date.now();

  // Default to yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  const dateStart = options?.dateStart || yesterdayStr;
  const dateEnd = options?.dateEnd || yesterdayStr;

  try {
    // 1. Discover keys
    const { operatorKeys, agentKeys } = await discoverKVKeys(
      env.METERING,
      dateStart,
      dateEnd
    );

    console.log(`[etl] discovered ${operatorKeys.length} operator keys, ${agentKeys.length} agent keys`);

    // 2. Load operator metrics
    const operatorInserted = await transformOperatorMetrics(
      operatorKeys,
      env.METERING,
      createSupabaseClient(env)
    );

    // 3. Load agent metrics
    const agentInserted = await transformAgentMetrics(
      agentKeys,
      env.METERING,
      createSupabaseClient(env)
    );

    // 4. Cleanup (optional)
    if (!options?.skipCleanup && dateStart === yesterdayStr) {
      await cleanupOldKVMetrics(env.METERING, yesterdayStr);
    }

    const durationMs = Date.now() - startTime;
    console.log(`[etl] completed in ${durationMs}ms: ${operatorInserted} operator rows, ${agentInserted} agent rows`);

    // Alert if took too long
    if (durationMs > 300000) {
      console.warn(`[etl] ETL took ${durationMs}ms (>5min threshold)`);
    }

    return { status: "success", operatorRowsInserted: operatorInserted, agentRowsInserted: agentInserted, durationMs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[etl] failed: ${msg}`);
    return { status: "failed", operatorRowsInserted: 0, agentRowsInserted: 0, durationMs: Date.now() - startTime };
  }
}
```

---

## Deployment

### Option A: Cloudflare Cron Trigger

Add to `wrangler.toml`:

```toml
[[triggers.crons]]
cron = "0 2 * * *"  # 2 AM UTC daily
```

Expose ETL endpoint in index.ts:

```typescript
if (url.pathname === "/admin/etl" && request.method === "POST") {
  const result = await runETL(env, ctx);
  return Response.json(result);
}
```

### Option B: External Cron Service

Use Upstash, EasyCron, or similar to POST to `/admin/etl` daily.

### Option C: Supabase Database Cron

Use `pg_cron` extension in Postgres (if using Supabase) to call a webhook.

---

## Backfill Procedure

To catch up after downtime:

```typescript
// POST /admin/etl?dateStart=2026-05-15&dateEnd=2026-05-18
const dateStart = url.searchParams.get("dateStart");
const dateEnd = url.searchParams.get("dateEnd");

const result = await runETL(env, ctx, { dateStart, dateEnd });
return Response.json(result);
```

---

## Monitoring & Alerts

### Success Metrics

- `operatorRowsInserted > 0` (at least one chain had traffic)
- `agentRowsInserted > 0` (at least one payer had traffic)
- `durationMs < 300000` (completed in <5 min)

### Failure Handling

- **Partial failure**: Log which rows failed, retry manually
- **Supabase unavailable**: Skip load phase, retry next day
- **KV unavailable**: Abort, alert ops

### Logging

All messages prefixed with `[etl]` for easy filtering:

```
[etl] discovered 5 operator keys, 120 agent keys
[etl] completed in 45231ms: 5 operator rows, 120 agent rows
[etl] failed: network timeout
```

---

## Future Enhancements

1. **Venue Metrics Materialization**: Also load `metrics:operator:venue:*` into a venue-level table
2. **Fallback Log Analysis**: Separate fallback_log:* keys into a dedicated table
3. **Real-time Dashboards**: Use Supabase Realtime to stream metric updates
4. **Archive Strategy**: Move >30-day KV data to Cloudflare R2 before deletion
5. **Data Retention Policy**: Archive >1 year of Supabase data to S3
