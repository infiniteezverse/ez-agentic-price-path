# EZ-Path Treasury Bot

Automated LP (Liquidity Provider) bot that:
1. **Mints LP positions** on Aerodrome (USDC-WETH)
2. **Tracks agent swaps** flowing through your liquidity
3. **Collects fees** hourly
4. **Reports metrics** for discovery

## Phase 1: Liquidity Mining Pilot

Deploy capital to Aerodrome, capture agent flow data, and prove agents naturally use your infrastructure.

## Setup

### Environment Variables

Create `.env.treasury`:

```bash
# Base mainnet RPC
BASE_RPC_URL=https://mainnet.base.org

# Treasury wallet (receives LP tokens)
TREASURY_ADDRESS=0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad

# Relayer private key (signs onchain txs)
RELAYER_PRIVATE_KEY=0x...

# Optional: Dune API for metric reporting
DUNE_API_KEY=your_dune_api_key
DUNE_DASHBOARD_ID=your_dashboard_id

# Optional: Slack alerts
SLACK_WEBHOOK=https://hooks.slack.com/...
```

### Install Dependencies

```bash
cd treasury
npm install
```

### Fund Treasury

Send USDC + WETH to the treasury address:

```bash
# On Base mainnet
# USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
# WETH: 0x4200000000000000000000000000000000000006
```

Recommend:
- 50 USDC
- 0.025 WETH (~$50-100 total)

## Running

### Development

```bash
npm run dev
```

This will:
1. Check treasury balances
2. Mint an LP position on Aerodrome
3. Start listening for swaps
4. Report metrics every hour

### Production

```bash
npm run build
npm run monitor
```

## Metrics

Every hour, the bot outputs:

```
📊 Hourly Metrics Report
═══════════════════════════════════════════════════
Total Swaps: 42
Volume: 12500000 USDC
Fees Earned: 1250 USDC
Unique Swappers: 18
APY: 45.2%

Top Swappers:
  0x1234... | 5000000 USDC | 12 swaps
  0x5678... | 3200000 USDC | 8 swaps
```

### Pushing to Dune

If `DUNE_API_KEY` is set, metrics are automatically pushed to your Dune dashboard.

Query example:

```sql
SELECT
  timestamp,
  total_swaps,
  total_volume_usdc,
  fees_earned_usdc,
  apy
FROM ezpath_treasury_metrics
ORDER BY timestamp DESC
LIMIT 7;
```

## Architecture

```
LPManager (Aerodrome interaction)
├── Mint position
├── Collect fees
└── Rebalance if needed

SwapTracker (Event listener)
├── Listen to Swap events
├── Calculate fees earned
└── Identify agent swaps

Reporter (Metrics export)
├── Hourly aggregation
├── Dune export
└── Slack alerts
```

## Key Contracts

- **Aerodrome Router**: `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43`
- **Position Manager**: `0x4e9f0eb37A880b8BeF3e77e0e5d32e08Bd5bfb97`
- **USDC on Base**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **WETH on Base**: `0x4200000000000000000000000000000000000006`

## Next Steps (Phase 2)

Once Phase 1 is running:
1. Monitor metrics for 1-2 weeks
2. Publish performance to X/Discord
3. Move to Phase 2: Solver Framework

## Troubleshooting

### "Treasury has no USDC balance"

Fund the treasury address with USDC on Base mainnet.

### "Failed to mint position"

- Check relayer ETH balance (needs gas)
- Verify RELAYER_PRIVATE_KEY is correct
- Ensure BASE_RPC_URL is responding

### "No swaps detected"

- Monitor may need to run longer to capture swaps
- Check that pool is active on Aerodrome
- Verify USDC-WETH pair exists on Base

## References

- [Aerodrome V3 Docs](https://aerodrome.finance)
- [Base Chain](https://base.org)
- [Viem Docs](https://viem.sh)
