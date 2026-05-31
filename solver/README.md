# EZ-Path Solver Framework

Intent-based route execution service that queries **three sources** and picks the best one:

1. **EZ-Path** — 10-venue aggregated quote ($0.03-0.50 via X402)
2. **Treasury LP** — Direct Aerodrome liquidity (0% fees for small swaps)
3. **Direct DEX** — Fallback to single-venue (Uniswap V3)

## Phase 2: Smart Route Selection

Not a venue aggregator (EZ-Path does that). Instead, a **service router** that decides:
- Should we use EZ-Path's 10-venue race?
- Or Treasury LP's direct liquidity?
- Or direct DEX?

Picks the one with highest `buyAmount` and lowest `feeAmount`.

## Setup

### Environment Variables

Create `.env.solver`:

```bash
BASE_RPC_URL=https://mainnet.base.org
EZPATH_URL=https://ezpath.myezverse.xyz
TREASURY_LP_ADDRESS=0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad
SOLVER_PRIVATE_KEY=0x...
SOLVER_PORT=3001
SOLVER_HOST=0.0.0.0
```

### Install Dependencies

```bash
cd solver
npm install
```

## Running

### Development

```bash
npm run dev
```

Starts Express server on `http://localhost:3001`

### Production

```bash
npm run build
npm run solver
```

## API Endpoints

### POST /solver/submit-intent

Submit a swap intent, get ranked routes:

```bash
curl -X POST http://localhost:3001/solver/submit-intent \
  -H "Content-Type: application/json" \
  -d '{
    "sellToken": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "buyToken": "0x4200000000000000000000000000000000000006",
    "sellAmount": "1000000",
    "minBuyAmount": "500",
    "chain": "base"
  }'
```

**Response:**

```json
{
  "intentId": "intent-1234567890-abc123",
  "routes": [
    {
      "routeId": "route-1",
      "source": "ez-path",
      "buyAmount": "2050",
      "feeAmount": "30",
      "feePercentage": 0.003,
      "executionTime": 2000,
      "metadata": {
        "venues": ["0x", "ParaSwap", "Aerodrome"]
      }
    },
    {
      "routeId": "route-2",
      "source": "treasury-lp",
      "buyAmount": "2025",
      "feeAmount": "0",
      "feePercentage": 0,
      "executionTime": 500
    }
  ],
  "bestRoute": { "routeId": "route-1", ... }
}
```

### POST /solver/execute

Execute the selected route:

```bash
curl -X POST http://localhost:3001/solver/execute \
  -H "Content-Type: application/json" \
  -d '{
    "intentId": "intent-1234567890-abc123",
    "routeId": "route-1"
  }'
```

**Response:**

```json
{
  "result": {
    "intentId": "intent-1234567890-abc123",
    "routeId": "route-1",
    "txHash": "0xabc123...",
    "status": "success",
    "amountOut": "2050",
    "actualFee": "30",
    "executedAt": 1234567890
  },
  "message": "✅ Executed successfully"
}
```

### GET /solver/metrics

Get solver metrics:

```bash
curl http://localhost:3001/solver/metrics
```

**Response:**

```json
{
  "timestamp": 1234567890000,
  "totalIntents": 42,
  "executedIntents": 40,
  "failedIntents": 2,
  "routeDistribution": {
    "ez_path": 25,
    "treasury_lp": 12,
    "direct_dex": 3
  },
  "totalVolume": "5000000000",
  "totalFeesCaptured": "150000"
}
```

### GET /solver/health

Health check:

```bash
curl http://localhost:3001/solver/health
```

## Architecture

```
Agent/Router Request
       ↓
POST /solver/submit-intent
       ↓
Query EZ-Path + Treasury LP + Direct DEX (parallel)
       ↓
Rank by buyAmount (highest first)
       ↓
Return routes array
       ↓
Agent/Router picks best
       ↓
POST /solver/execute
       ↓
Execute via selected service
       ↓
Record on-chain (SolverRegistry)
```

## Key Components

| File | Purpose |
|------|---------|
| `types.ts` | Type definitions (Intent, SolverRoute, etc) |
| `intent-listener.ts` | Query 3 services, rank routes |
| `settlement.ts` | Execute winning route, handle each service |
| `config.ts` | Configuration, service endpoints |
| `start.ts` | Express server, API endpoints |
| `contracts/SolverRegistry.sol` | On-chain intent log |

## Service Queries

**EZ-Path:**
- Calls `GET /api/v1/quote`
- Returns best 10-venue quote
- Fee: $0.03-0.50 (X402)

**Treasury LP:**
- Checks if swap is USDC-WETH on Base
- If small swap (<$10k), estimates buy amount
- Fee: 0% (LP earns, doesn't charge)

**Direct DEX:**
- Fallback to Uniswap V3
- Estimates via on-chain quoter
- Fee: 0.05% (DEX fee)

## Next Steps (Phase 3)

Once Phase 2 is running:
1. Deploy SolverRegistry contract
2. Record intents on-chain
3. Build Phase 3: Open Router
4. Router = master aggregator of EZ-Path + Solver + Treasury

## References

- [ARCHITECTURE.md](/ARCHITECTURE.md) — Full three-phase plan
- [Treasury Bot](/treasury) — Phase 1
- [Open Router](/router) — Phase 3 (coming)
