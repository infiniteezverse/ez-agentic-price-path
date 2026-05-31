# EZ-Path Modular Architecture (Approach B)

This document describes the three-phase modular architecture for scaling EZ-Path from a single quote router to a comprehensive DeFi agent infrastructure.

## Overview

```
Phase 1: Treasury          Phase 2: Solver           Phase 3: Router
  (LP Mining)            (Intent Execution)      (Route Aggregation)
       ↓                        ↓                       ↓
  Aerodrome LP         Intent Listener +        Route Aggregator
  Swap Tracking        Ranking Engine           (Orchestrates all)
  Metrics Export       Settlement
```

---

## Phase 1: LP Treasury Bot ✅ (Active)

**Location**: `/treasury`

**Purpose**: Deploy capital to Aerodrome, capture agent swap flow, prove agent discovery through liquidity.

### Key Components

| File | Purpose |
|------|---------|
| `src/types.ts` | Shared types (LPPosition, TrackedSwap, HourlyMetrics) |
| `src/lp-manager.ts` | Aerodrome V3 position lifecycle (mint, collect, rebalance) |
| `src/swap-tracker.ts` | Event listener for swaps, fee calculation |
| `src/config.ts` | Base mainnet config, Aerodrome contracts |
| `src/start.ts` | Main loop (initialize, monitor, report) |

### API Surface

```typescript
// Initialize
const lpManager = new LPManager(publicClient, walletClient, config);
const swapTracker = new SwapTracker(publicClient, config);

// Mint position
const position = await lpManager.mintPosition(usdcAmount, wethAmount);

// Track swaps
await swapTracker.startListening();
const metrics = await swapTracker.getMetrics(startTime, endTime);

// Collect fees
const fees = await lpManager.collectFees(tokenId);
```

### Outputs

- **Hourly metrics**: JSON to stdout, Dune, database
- **Fee tracking**: USDC earned per hour
- **Agent metrics**: Unique swappers, top agents, volume

### Data Flow

```
Aerodrome USDC-WETH Pool
         ↓
    Swap Events
         ↓
   SwapTracker
  (listens, logs)
         ↓
   Metrics Export
  (stdout, Dune, DB)
```

---

## Phase 2: Solver Framework (Next)

**Location**: `/solver`

**Purpose**: Accept swap intents from agents/routers, rank routes (EZ-Path core vs Treasury LP vs direct DEX), execute and record settlements.

### Planned Components

| File | Purpose |
|------|---------|
| `src/intent-listener.ts` | Listen to `/solver/submit-intent` POST requests |
| `src/ranking-engine.ts` | Query all 3 sources, rank by buyAmount |
| `src/settlement.ts` | Execute winning route, record settlement |
| `contracts/SolverRegistry.sol` | On-chain intent log (for transparency) |

### API Surface

```typescript
// Agent submits intent
POST /solver/submit-intent
{
  sellToken: "0x...",
  buyToken: "0x...",
  sellAmount: "1000000",
  minBuyAmount: "2000",
  deadline: 1234567890
}

// Response: ranked routes
[
  {
    routeId: "route-0",
    source: "ez-path",
    buyAmount: "2050",
    feeAmount: "30"
  },
  {
    routeId: "route-1",
    source: "treasury-lp",
    buyAmount: "2025",
    feeAmount: "0"
  }
]

// Execute route
POST /solver/execute
{ intentId, routeId }
// Returns: { txHash, status }
```

### Links to Phase 1

- Treasury LP can serve certain swaps (low fee vs 0x)
- Solver can route small swaps to Treasury, large ones to 0x
- Fee capture: EZ-Path $0.03, Treasury $0, split as needed

---

## Phase 3: Open Router (Later)

**Location**: `/router`

**Purpose**: Public-facing route aggregator. Queries EZ-Path Core + Solver + Treasury, returns best route. Becomes a product you can sell/license.

### Planned Components

| File | Purpose |
|------|---------|
| `src/route-aggregator.ts` | Query all 3, rank, return best |
| `src/route-executor.ts` | Dispatch to EZ-Path/Solver/Treasury |

### API Surface

```typescript
// Get best route for swap
GET /router/quote
{
  sellToken: "0x833589...",
  buyToken: "0x4200000...",
  sellAmount: "1000000",
  slippagePercentage: 0.01
}

// Response
{
  route: { source: "ez-path", buyAmount: "2050", ... },
  feeBreakdown: {
    x402_fee: 30000,
    solver_fee: 0,
    lp_fee: 0
  }
}
```

### Why Separate?

- **Modularity**: Each service can scale independently
- **Resellable**: Router becomes a standalone product
- **Composable**: Other projects can use Solver + Treasury
- **Testable**: Each phase proven before combining

---

## File Structure

```
ez-path/
├── src/                    ← Core EZ-Path Worker
│   ├── quote-router.ts    (unchanged)
│   ├── chains/
│   └── ...
│
├── treasury/               ← PHASE 1 (LP Treasury Bot)
│   ├── src/
│   │   ├── types.ts
│   │   ├── lp-manager.ts
│   │   ├── swap-tracker.ts
│   │   ├── config.ts
│   │   └── start.ts
│   ├── package.json
│   └── README.md
│
├── solver/                 ← PHASE 2 (Solver Framework)
│   ├── src/
│   │   ├── intent-listener.ts
│   │   ├── ranking-engine.ts
│   │   ├── settlement.ts
│   │   └── types.ts
│   ├── contracts/
│   │   └── SolverRegistry.sol
│   ├── package.json
│   └── README.md
│
├── router/                 ← PHASE 3 (Open Router)
│   ├── src/
│   │   ├── route-aggregator.ts
│   │   ├── route-executor.ts
│   │   └── types.ts
│   ├── package.json
│   └── README.md
│
├── contracts/              ← Shared (on-chain)
│   ├── EZPathTreasury.sol
│   ├── SolverRegistry.sol
│   └── RouterInterface.sol
│
├── ARCHITECTURE.md         ← This file
└── package.json (root workspaces)
```

---

## Data Flow (Full Stack)

```
Agent Request
    ↓
┌─────────────────────────────┐
│ Open Router (Phase 3)       │
│ GET /router/quote           │
└─────────────────────────────┘
    ↓ ↓ ↓ (parallel queries)
    │ │ └→ Treasury LP
    │ │    (SwapTracker metrics)
    │ │
    │ └──→ Solver (Phase 2)
    │      (Intent ranking)
    │
    └────→ EZ-Path Core
           (10-venue quote)
    ↓ ↓ ↓ (returns all)
    │ │ └→ Best: "ez-path" for $2050
    │ └──→ Good: "treasury" for $2025
    └────→ Fast: "direct" for $2010
           (user picks)
           ↓
       Execute via Phase 3
       (settle, record)
           ↓
   Metrics updated in Phase 1
```

---

## Execution Timeline

### Week 1: Phase 1 (Treasury) ✅

- [x] Directory structure
- [x] LP Manager (mint, collect)
- [x] Swap Tracker (events, metrics)
- [x] Config & startup
- [ ] **NEXT**: Install deps, fund treasury, test on mainnet

### Week 2: Phase 1 Validation

- Mint LP position
- Run for 7 days, collect metrics
- Publish results

### Week 3: Phase 2 (Solver)

- Build intent listener
- Implement ranking engine
- Deploy SolverRegistry contract

### Week 4: Phase 3 (Router)

- Combine all 3
- Test end-to-end
- Launch as product

---

## Key Decisions

**Modular over Monolithic**
- Each phase runs independently
- Can be deployed, scaled, versioned separately
- Phase 3 can be sold/licensed without Phase 1 running

**On-chain Intent Registry (SolverRegistry)**
- Transparent: All intents logged on-chain
- Auditable: Who solved what, when
- Governs: Future fee distribution, slashing

**Capital Efficiency**
- Phase 1 capital deployed to Aerodrome
- Returns fees (LP APY) + marketing signal (agent volume metrics)
- Not locked in: Can rebalance or withdraw anytime

---

## Success Metrics

### Phase 1
- ✅ Position mints successfully
- ✅ 100+ swaps tracked in first week
- ✅ 10+ unique agents using liquidity
- ✅ Metrics exported to Dune

### Phase 2
- ✅ 50+ intents processed daily
- ✅ Average execution time < 2s
- ✅ Zero failed settlements
- ✅ Treasury routes 20%+ of volume

### Phase 3
- ✅ Public API stable
- ✅ 1M+ routes calculated
- ✅ Licensed to 3+ external routers
- ✅ $10K+ monthly revenue

---

## References

- Phase 1 Details: `/treasury/README.md`
- Phase 2 (Planned): `/solver/README.md`
- Phase 3 (Planned): `/router/README.md`
