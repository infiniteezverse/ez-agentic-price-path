# EZ-Path Open Router

Public-facing route aggregator that orchestrates **three sources**:

1. **EZ-Path Core** — 10-venue aggregation
2. **Solver Framework** — Intent-based service routing  
3. **Treasury Bot** — Liquidity provider LP

Returns the single best route by `buyAmount` and `feePercentage`.

## Phase 3: Route Orchestration

Not building new functionality — just orchestrating existing services:

```
User Request → Router → Solver (queries EZ-Path + Treasury LP + Direct DEX)
                        → Returns ranked routes
                        → Router picks best
                        → Returns to user
```

## Setup

### Environment

Create `.env.router`:

```bash
ROUTER_PORT=3000
ROUTER_HOST=0.0.0.0
EZPATH_URL=https://ezpath.myezverse.xyz
SOLVER_URL=http://localhost:3001
TREASURY_URL=http://localhost:3002
BASE_RPC_URL=https://mainnet.base.org
```

### Install & Run

```bash
cd router
npm install
npm run dev
```

Starts on `http://localhost:3000`

## API

### GET /router/quote

Get the best route for a swap:

```bash
curl "http://localhost:3000/router/quote?chain=base&sellToken=0x833589...&buyToken=0x4200...&sellAmount=1000000"
```

**Response:**

```json
{
  "route": {
    "routeId": "route-1",
    "source": "ez-path",
    "buyAmount": "2050",
    "price": "0.00205",
    "priceImpact": 0.30,
    "feeAmount": "30",
    "feePercentage": 0.003,
    "executionTime": 2000,
    "slippage": 0.01,
    "metadata": { "venues": ["0x", "ParaSwap", "Aerodrome"] }
  },
  "feeBreakdown": {
    "x402_fee": "30"
  }
}
```

### GET /router/metrics

View router metrics:

```bash
curl http://localhost:3000/router/metrics
```

### GET /router/health

Health check:

```bash
curl http://localhost:3000/router/health
```

## Architecture

```
┌──────────────────────┐
│  EZ-Path Open Router │ (Phase 3) ← You are here
│  Port 3000           │
└──────────────────────┘
           ↓
┌──────────────────────┐
│ Solver Framework     │ (Phase 2)
│ Port 3001            │
└──────────────────────┘
    ↓      ↓       ↓
    │      │       │
    ▼      ▼       ▼
  EZ-Path  Treasury  Direct DEX
  Core     LP        (fallback)
  
(Phase 1)
```

## Running All Three

### Terminal 1: Phase 1 (Treasury Bot)

```bash
cd treasury
npm run dev
```

Tracks swaps, collects metrics (runs in background).

### Terminal 2: Phase 2 (Solver)

```bash
cd solver
npm run dev
```

Listens on port 3001. Queries EZ-Path + Treasury + DEX.

### Terminal 3: Phase 3 (Router)

```bash
cd router
npm run dev
```

Listens on port 3000. Public API.

Then make requests:

```bash
curl "http://localhost:3000/router/quote?chain=base&sellToken=0x833589...&buyToken=0x4200...&sellAmount=1000000"
```

## Next Steps

1. ✅ Scaffold Phase 1 (Treasury) — DONE
2. ✅ Scaffold Phase 2 (Solver) — DONE
3. ✅ Scaffold Phase 3 (Router) — DONE
4. **Run Phase 1** — Fund treasury, mint LP
5. **Deploy Solver** — Start service, record intents
6. **Launch Router** — Public API for agents

## References

- [ARCHITECTURE.md](/ARCHITECTURE.md) — Full three-phase design
- [Treasury Bot](/treasury) — Phase 1 (LP mining)
- [Solver Framework](/solver) — Phase 2 (intent routing)
