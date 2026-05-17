-- ─── Schema ────────────────────────────────────────────────────────────────

create table if not exists quote_calls (
  id             uuid        primary key default gen_random_uuid(),
  request_id     uuid        not null unique,
  payer_address  text        not null,
  sell_token     text        not null,
  buy_token      text        not null,
  sell_amount    text        not null,
  buy_amount     text        not null,
  price          text        not null,
  routing_engine text        not null,
  tier           text        not null check (tier in ('basic', 'resilient', 'institutional')),
  simulate       boolean     not null default false,
  settlement_tx  text,
  created_at     timestamptz not null default now()
);

-- ─── Indexes ───────────────────────────────────────────────────────────────

create index if not exists quote_calls_created_at_idx     on quote_calls (created_at desc);
create index if not exists quote_calls_payer_idx          on quote_calls (payer_address);
create index if not exists quote_calls_tier_idx           on quote_calls (tier);
create index if not exists quote_calls_routing_engine_idx on quote_calls (routing_engine);

-- ─── Fix bad price rows from pre-normalizedPrice testing ───────────────────

delete from quote_calls where price = buy_amount;

-- ─── View: daily revenue summary ───────────────────────────────────────────

create or replace view daily_revenue as
select
  date_trunc('day', created_at) at time zone 'utc'  as day,
  count(*)                                           as requests,
  count(*) filter (where tier = 'basic')             as basic_count,
  count(*) filter (where tier = 'resilient')         as resilient_count,
  count(*) filter (where tier = 'institutional')     as institutional_count,
  sum(case
    when tier = 'basic'         then 0.03
    when tier = 'resilient'     then 0.10
    when tier = 'institutional' then 0.50
    else 0
  end)                                               as revenue_usdc
from quote_calls
where simulate = false
group by 1
order by 1 desc;

-- ─── View: routing engine win distribution ─────────────────────────────────

create or replace view engine_wins as
select
  routing_engine,
  tier,
  count(*)                                                                    as wins,
  round(count(*) * 100.0 / sum(count(*)) over (partition by tier), 1)        as win_pct
from quote_calls
where simulate = false
group by routing_engine, tier
order by tier, wins desc;

-- ─── View: top payers (all time) ───────────────────────────────────────────

create or replace view top_payers as
select
  payer_address,
  count(*)                                           as total_requests,
  count(*) filter (where tier = 'basic')             as basic,
  count(*) filter (where tier = 'resilient')         as resilient,
  count(*) filter (where tier = 'institutional')     as institutional,
  sum(case
    when tier = 'basic'         then 0.03
    when tier = 'resilient'     then 0.10
    when tier = 'institutional' then 0.50
    else 0
  end)                                               as lifetime_revenue_usdc,
  min(created_at)                                    as first_seen,
  max(created_at)                                    as last_seen
from quote_calls
where simulate = false
group by payer_address
order by lifetime_revenue_usdc desc;
