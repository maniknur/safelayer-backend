#!/bin/bash
#
# OpenClaw Agent Test Suite
# Quick script to test Guardian and Sentinel endpoints
#

BASE_URL="http://localhost:3001"
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}    OpenClaw Autonomous Risk Agents - Test Suite${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

# Test addresses (from test suite)
TEST_ADDRESS="0x10ed43c718714eb63d5aa57b78b54704e256024e"
INVALID_ADDRESS="0xInvalidAddress"

echo -e "${YELLOW}[1] Testing Health Check${NC}"
curl -s "$BASE_URL/health" | jq . || echo "Failed"
echo ""

echo -e "${YELLOW}[2] Testing Guardian Check - Valid Address${NC}"
echo "Request: POST /api/guardian/check"
echo "Payload: { \"targetAddress\": \"$TEST_ADDRESS\" }"
echo ""
curl -s -X POST "$BASE_URL/api/guardian/check" \
  -H "Content-Type: application/json" \
  -d "{\"targetAddress\": \"$TEST_ADDRESS\"}" | jq .
echo ""

echo -e "${YELLOW}[3] Testing Guardian Check - Invalid Address${NC}"
echo "Request: POST /api/guardian/check"
echo "Payload: { \"targetAddress\": \"$INVALID_ADDRESS\" }"
echo ""
curl -s -X POST "$BASE_URL/api/guardian/check" \
  -H "Content-Type: application/json" \
  -d "{\"targetAddress\": \"$INVALID_ADDRESS\"}" | jq .
echo ""

echo -e "${YELLOW}[4] Testing Guardian Status${NC}"
echo "Request: GET /api/guardian/status"
echo ""
curl -s "$BASE_URL/api/guardian/status" | jq .
echo ""

echo -e "${YELLOW}[5] Testing Agent System Status${NC}"
echo "Request: GET /api/agents/status"
echo ""
curl -s "$BASE_URL/api/agents/status" | jq .
echo ""

echo -e "${YELLOW}[6] Testing Existing Risk Endpoint${NC}"
echo "Request: GET /api/risk/$TEST_ADDRESS"
echo ""
curl -s "$BASE_URL/api/risk/$TEST_ADDRESS" | jq '.success, .data.risk_score, .data.risk_level' || echo "Failed"
echo ""

echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}    Test Suite Complete${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
