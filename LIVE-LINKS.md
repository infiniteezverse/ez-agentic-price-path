# EZ-Path: Live Links & Git Information

## 🔴 Live API Endpoints

### Production
- **API Base:** https://api.myezverse.xyz/api/v1/quote
- **Domain:** ezpath.myezverse.xyz (Cloudflare Workers)
- **Status:** ✅ Production (HTTP 402 compliant, agentic.market validated)
- **Latest Version:** cda3e2f3-5b39-49e9-adf7-0879bda01033

### Testing
- **Probe (Free):** `GET https://api.myezverse.xyz/api/v1/quote?sellToken=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&buyToken=0x4200000000000000000000000000000000000006&sellAmount=1000000`
- **Expected Response:** HTTP 402 with x402Version: 2, PAYMENT-REQUIRED header, Bazaar extension

---

## 📦 Package Registries

### npm
- **Package:** `mcp-ezpath`
- **Version:** 0.1.1
- **Registry:** https://www.npmjs.com/package/mcp-ezpath
- **Install:** `npm install mcp-ezpath`
- **Status:** ✅ Published and working

---

## 🔗 GitHub Repository

### Main Repo
- **URL:** https://github.com/infiniteezverse/ez-agentic-price-path
- **Branch:** main
- **Clone:** `git clone https://github.com/infiniteezverse/ez-agentic-price-path.git`
- **Latest Commit:** 34c4ee3 (docs: Add comprehensive implementation and strategic analysis)

### Recent Commit History
```
34c4ee3 docs: Add comprehensive implementation and strategic analysis
9251f50 fix: Use proper UTF-8 encoding for PAYMENT-REQUIRED header (btoa fix)
96efee5 fix: Add PAYMENT-REQUIRED header to rate-limit 402 response (X402 v2 spec)
47d6dc8 fix: Return full 402 structure on rate limit (not minimal response)
4e39b1d fix: X402 compliance - return 402 (not 429) on rate limit for probes
4b4fdbd docs: Update security audit — all remaining items now fixed
12ba50c fix: Implement payer authentication for metrics endpoint
c6e9a27 chore: Run npm audit fix to address high-severity dependencies
2d1fd0f Security: Fix critical issues and add input validation
bc85984 Docs: Add security rules and pre-deploy checklist for critical fixes
```

### Key Documentation Files
- **AGENT-INTEGRATION-GUIDE.md** — How agents integrate with EZ-Path (5-minute setup)
- **PRODUCT-OUTLINE.md** — Product pitch for Base builders ($2,500 → $0.30/day savings)
- **TWITTER-POSTS.md** — Social media templates (ready to post)
- **IMPLEMENTATION-NOTES.md** — Technical deep-dive
- **STRATEGIC-IMPLICATIONS.md** — Market positioning
- **SECURITY-AUDIT.md** — Full security findings and fixes
- **CLAUDE.md** — 11 learned rules for maintenance
- **NOTION-OUTLINE.md** — Technical specification for agents

---

## 🎯 Marketplace & Discovery

### agentic.market
- **Status:** ✅ Listed and validated
- **URL:** https://agentic.market
- **Search for:** "EZ-Path" or "DEX router"
- **Validation:** Passes all X402 v2 checks
- **Bazaar Discovery:** ✅ Crawled and indexed

### awesome-x402
- **Status:** ✅ Reference implementation (xpaysh merger)
- **Repository:** https://github.com/xpaysh/awesome-x402
- **Mention:** EZ-Path as DEX routing reference
- **Significance:** Standard library integration

---

## 🛠️ Integration Options (Live)

### Option 1: MCP Server (Easiest)
- **Package:** mcp-ezpath@0.1.1
- **Repository:** /mcp-server/ (in ez-path repo)
- **Installation:** `npm install mcp-ezpath`
- **Status:** ✅ Live, tested with Claude
- **Tools:** `ezpath_probe` (free), `ezpath_quote` (paid)

### Option 2: HTTP API (Flexible)
- **Endpoint:** https://api.myezverse.xyz/api/v1/quote
- **Methods:** GET (both probe and quote)
- **Payment:** X-Payment header with EIP-712 signature
- **Status:** ✅ Live, agentic.market compliant

### Option 3: CLI (Quick Testing)
- **Tool:** @x402/awal
- **Command:** `awal x402 pay "https://api.myezverse.xyz/api/v1/quote" --query {...}`
- **Status:** ✅ Live

---

## 🔐 Cloudflare Deployment

### Worker Configuration
- **Name:** ezpath-router
- **File:** worker.toml (NOT wrangler.toml)
- **Deploy Command:** `npx wrangler deploy --config worker.toml`
- **Custom Domain:** ezpath.myezverse.xyz
- **ETL Cron:** 0 2 * * * (daily at 2 AM UTC)
- **KV Namespace:** METERING (2fdd6978310a44a18ff0e34da538c9a0)

### Secrets (Cloudflare Dashboard)
- ZERO_EX_API_KEY ✅ Set
- RELAYER_PRIVATE_KEY ✅ Set (fresh after rotation)
- BASE_RPC_URL ✅ Set
- SUPABASE_SERVICE_ROLE_KEY ✅ Set
- ADMIN_API_KEY ✅ Set (rotated, in secrets)
- PARASWAP_API_KEY (optional) ⚠️ Not set

---

## 📊 Token Addresses (Base Mainnet)

Used in all tests and integration examples:
```
USDC:  0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (6 decimals)
WETH:  0x4200000000000000000000000000000000000006 (18 decimals)
ZEN:   0xf43eb8de897fbc7f2502483b2bef7bb9ea179229 (18 decimals)
```

---

## 🚀 Key Deployment Versions

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| cda3e2f3 | 2026-06-23 | UTF-8 encoding fix (btoa) | ✅ Live |
| e8960112 | 2026-06-23 | PAYMENT-REQUIRED header | ✅ Live |
| 10546577 | 2026-06-23 | Full 402 structure on rate limit | ✅ Live |
| 0f77d4bd | 2026-06-23 | ReferenceError fix (id → identifier) | ✅ Live |
| 420f380b | 2026-06-23 | Critical security fixes | ✅ Live |
| 117728c7 | Earlier | ParaSwap fallback + 0x fix | ✅ Live |
| 9306a955 | Earlier | Pricing normalization | ✅ Live |

---

## 📈 Monitoring & Metrics

### agentic.market Validation
- **Validator:** https://agentic.market (search bar)
- **Current Status:** ✅ All checks passing
- **Revalidate:** Run validator anytime to confirm live status

### Metrics Endpoint
- **URL:** GET https://api.myezverse.xyz/api/v1/metrics/agent/{chain}/{payer}/{date}
- **Auth:** ADMIN_API_KEY bearer token OR X-Payment signed proof
- **Purpose:** Track agent usage (ETL reads nightly at 2 AM UTC)

### Test Commands
```bash
# Probe (free)
curl "https://api.myezverse.xyz/api/v1/quote?sellToken=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&buyToken=0x4200000000000000000000000000000000000006&sellAmount=1000000"

# Check status
curl -I "https://api.myezverse.xyz/api/v1/quote?..." | grep HTTP

# Validate response
curl "https://api.myezverse.xyz/api/v1/quote?..." | jq '.x402Version, .PAYMENT-REQUIRED'
```

---

## 🎨 Social Media & Marketing

### Twitter
- **Draft Posts Ready:** TWITTER-POSTS.md (multiple options, copy-paste ready)
- **Best Performing:** Cost-savings angle ($2,500 → $0.30/day)
- **Thread Format:** 4-tweet thread with problem → solution → technical → CTA

### agentic.market Profile
- **Auto-Listed:** Yes (no manual registration needed)
- **Category:** DEX Router
- **Search Keywords:** "DEX", "quote", "routing", "base", "x402"

---

## 📚 Documentation Sites

### In Repository (git)
- AGENT-INTEGRATION-GUIDE.md — Agent developer docs
- PRODUCT-OUTLINE.md — Business/sales positioning
- IMPLEMENTATION-NOTES.md — Technical architecture
- STRATEGIC-IMPLICATIONS.md — Market analysis
- SECURITY-AUDIT.md — Security findings
- CLAUDE.md — Maintenance rules

### External (agentic.market)
- Listed endpoint metadata
- Bazaar extension (auto-discovered)
- Schema validation info

---

## 🔄 Continuous Integration

### Tests
- **Run:** `npm run test:unit`
- **Coverage:** 40/40 passing
- **Pre-Deploy:** Always run before deploy
- **Status:** ✅ All green

### Deployment
- **Automated:** No (manual via `wrangler deploy`)
- **Rollback:** Previous versions available in Cloudflare dashboard
- **Frequency:** Deploy after successful tests

---

## 💡 Quick Reference

**For Agents:**
1. Install: `npm install mcp-ezpath`
2. Test: `await ezpath_probe({...})`
3. Query: `await ezpath_quote({...})`
4. Deploy: Use in your framework

**For Builders:**
1. Read: AGENT-INTEGRATION-GUIDE.md
2. Check: PRODUCT-OUTLINE.md for ROI math
3. Review: IMPLEMENTATION-NOTES.md for architecture

**For Operators:**
1. Monitor: agentic.market validator
2. Check: Test curl commands work
3. Review: Latest deployment version in Cloudflare

---

**Status:** Everything is live and connected. agentic.market discovery is active. Ready for agent adoption.
