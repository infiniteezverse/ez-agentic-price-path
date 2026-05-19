#!/bin/bash

# Monitor EZ-Path transaction volume in real-time
# Watches KV metrics and alerts on first external agent transaction

set -e

API_BASE_URL="${API_BASE_URL:-https://ezpath.myezverse.xyz}"
ADMIN_KEY="${ADMIN_API_KEY:-}"
CHECK_INTERVAL=30

if [ -z "$ADMIN_KEY" ]; then
  echo "❌ Error: ADMIN_API_KEY not set"
  exit 1
fi

echo "🚀 EZ-Path Volume Monitor Started"
echo "📊 Checking every $CHECK_INTERVAL seconds"
echo ""

LAST_COUNT=0
NOTIFICATION_SENT=0

while true; do
  TODAY=$(date +"%Y-%m-%d")
  
  RESPONSE=$(curl -s -H "Authorization: Bearer $ADMIN_KEY" \
    "$API_BASE_URL/api/v1/metrics/operator/base/$TODAY")
  
  COUNT=$(echo "$RESPONSE" | jq -r '.request_count // 0' 2>/dev/null || echo "0")
  REVENUE=$(echo "$RESPONSE" | jq -r '.total_revenue_usd // "0"' 2>/dev/null || echo "0")
  
  if [ "$COUNT" != "$LAST_COUNT" ]; then
    echo "📈 [$(date '+%H:%M:%S')] Requests: $COUNT | Revenue: \$$REVENUE"
    LAST_COUNT=$COUNT
    
    if [ "$COUNT" -gt 0 ] && [ "$NOTIFICATION_SENT" -eq 0 ]; then
      echo ""
      echo "🎉 =============================================="
      echo "   FIRST TRANSACTION DETECTED!"
      echo "   Request #1 successfully routed through EZ-Path"
      echo "   Revenue: \$$REVENUE"
      echo "=============================================="
      echo ""
      NOTIFICATION_SENT=1
    fi
  fi
  
  sleep $CHECK_INTERVAL
done
