#!/bin/bash
# Integration Test: Backend ↔ Smart Contract via OpenClaw Agents

BASE_URL="http://localhost:3001"

echo "═══════════════════════════════════════════════════════════"
echo "  SafeLayer OpenClaw ↔ Smart Contract Integration Test"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test address
TEST_ADDRESS="0x10ed43c718714eb63d5aa57b78b54704e256024e"

echo -e "${YELLOW}[1] Check Backend Health${NC}"
if curl -s "$BASE_URL/health" | jq . >/dev/null 2>&1; then
  echo -e "${GREEN}✅ Backend running${NC}"
else
  echo -e "${RED}❌ Backend not responding${NC}"
  exit 1
fi
echo ""

echo -e "${YELLOW}[2] Check OpenClaw Agents Status${NC}"
AGENT_STATUS=$(curl -s "$BASE_URL/api/agents/status")
echo "$AGENT_STATUS" | jq '.agents | keys[]'
echo ""

echo -e "${YELLOW}[3] Test Guardian - Risk Analysis${NC}"
GUARDIAN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/guardian/check" \
  -H "Content-Type: application/json" \
  -d "{\"targetAddress\": \"$TEST_ADDRESS\"}")

RISK_SCORE=$(echo "$GUARDIAN_RESPONSE" | jq '.data.riskScore')
ALLOWED=$(echo "$GUARDIAN_RESPONSE" | jq '.data.allowed')

echo "Address: $TEST_ADDRESS"
echo "Risk Score: $RISK_SCORE"
echo "Allowed: $ALLOWED"
echo "Full Response:"
echo "$GUARDIAN_RESPONSE" | jq '.'
echo ""

if [ "$RISK_SCORE" -gt 70 ]; then
  echo -e "${YELLOW}[4] Check if HIGH RISK Score → Should Trigger Sentinel Submission${NC}"
  echo "Risk Score ($RISK_SCORE) >= Threshold (70)"
  echo "Action: Sentinel should submit to Smart Contract"
  echo "Status: Check Railway logs for submission details"
  echo ""
fi

echo -e "${YELLOW}[5] Check Latest Contract Report${NC}"
curl -s "$BASE_URL/api/registry/latest?address=$TEST_ADDRESS" | jq '.' || echo "No previous reports yet"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  Integration Test Complete"
echo "═══════════════════════════════════════════════════════════"
