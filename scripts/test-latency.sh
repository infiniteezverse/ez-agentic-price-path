#!/bin/bash

API_URL="https://ezpath.myezverse.xyz"
ADMIN_KEY="${ADMIN_API_KEY:?Set ADMIN_API_KEY in your environment}"

USDC="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
WETH="0x4200000000000000000000000000000000000006"

echo "🧪 EZ-Path Latency Test Suite"
echo "============================="
echo ""

test_tier() {
  local tier=$1
  
  echo "Testing $tier tier..."
  
  response=$(curl -s -w "\nHTTP:%{http_code}\nTIME:%{time_total}" \
    -H "Authorization: Bearer $ADMIN_KEY" \
    "$API_URL/api/v1/quote?sellToken=$USDC&buyToken=$WETH&sellAmount=1000000&tier=$tier")
  
  http_code=$(echo "$response" | grep "HTTP:" | cut -d: -f2)
  time_ms=$(echo "$response" | grep "TIME:" | cut -d: -f2 | awk '{printf "%.0f", $1 * 1000}')
  body=$(echo "$response" | grep -v "HTTP:" | grep -v "TIME:")
  
  if [ "$http_code" = "200" ]; then
    winner=$(echo "$body" | jq -r '.winner // "unknown"')
    edge=$(echo "$body" | jq -r '.edge_bps // 0')
    
    printf "  ✅ %s: %sms (winner: %s, edge: %sbps)\n" "$tier" "$time_ms" "$winner" "$edge"
  else
    printf "  ❌ %s: HTTP %s\n" "$tier" "$http_code"
  fi
  echo ""
}

test_tier "basic"
test_tier "resilient"
test_tier "institutional"

echo "============================="
echo "✅ Latency test complete"
