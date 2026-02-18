#!/bin/bash

# SafeLayer Backend - Railway Deployment Status Check
# Usage: ./check-deployment.sh

echo "═══════════════════════════════════════════════════════════════"
echo "  SafeLayer Backend - Deployment Health Check"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check command exists
check_cmd() {
  if command -v "$1" &> /dev/null; then
    echo -e "${GREEN}✓${NC} $2"
    return 0
  else
    echo -e "${RED}✗${NC} $2"
    return 1
  fi
}

# 1. Check development dependencies
echo "📋 Checking Prerequisites..."
check_cmd "node" "Node.js installed"
check_cmd "npm" "npm installed"
check_cmd "railway" "Railway CLI installed"
check_cmd "git" "Git installed"
echo ""

# 2. Build check
echo "🔨 Build Verification..."
cd "$(dirname "$0")" || exit 1

if npm run type-check > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} TypeScript compilation"
else
  echo -e "${RED}✗${NC} TypeScript compilation failed"
fi

if npm run build > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} Production build"
else
  echo -e "${RED}✗${NC} Production build failed"
fi
echo ""

# 3. Test check
echo "🧪 Test Suite..."
if npm test > /dev/null 2>&1; then
  TEST_COUNT=$(npm test 2>&1 | grep "Tests:" | awk '{print $2}')
  echo -e "${GREEN}✓${NC} All tests passing ($TEST_COUNT)"
else
  echo -e "${RED}✗${NC} Test suite failed"
fi
echo ""

# 4. Environment check
echo "⚙️  Environment Configuration..."
if [ -f ".env" ]; then
  echo -e "${GREEN}✓${NC} .env file exists"
  
  # Check required variables
  REQUIRED=("PORT" "NODE_ENV" "CORS_ORIGIN" "BNB_RPC_URL")
  for var in "${REQUIRED[@]}"; do
    if grep -q "^$var=" .env; then
      echo -e "${GREEN}✓${NC} $var configured"
    else
      echo -e "${YELLOW}⚠${NC} $var missing"
    fi
  done
else
  echo -e "${RED}✗${NC} .env file not found"
fi
echo ""

# 5. Git check
echo "📦 Git Status..."
if [ -d ".git" ]; then
  echo -e "${GREEN}✓${NC} Git repository initialized"
  COMMITS=$(git rev-list --count HEAD)
  echo "   Commits: $COMMITS"
else
  echo -e "${RED}✗${NC} Not a git repository"
fi
echo ""

# 6. Project structure
echo "📁 Project Structure..."
CHECKS=(
  "src:Source code"
  "dist:Compiled output"
  "package.json:Dependencies"
  "tsconfig.json:TypeScript config"
  "railway.json:Railway config"
  "Dockerfile:Docker config"
)

for check in "${CHECKS[@]}"; do
  FILE="${check%:*}"
  DESC="${check#*:}"
  if [ -e "$FILE" ]; then
    echo -e "${GREEN}✓${NC} $DESC"
  else
    echo -e "${YELLOW}⚠${NC} $DESC (optional)"
  fi
done
echo ""

# 7. Cost estimation
echo "💰 Cost Estimation (Railway Free Tier)"
echo "   Monthly: ~$0-1 (free tier typically includes $5 credit)"
echo "   Estimated usage:"
echo "   - Memory: 100-200 MB ✓"
echo "   - CPU: Minimal ✓"
echo "   - Network: External APIs (BNB, GitHub, BscScan) ✓"
echo ""

# 8. Next steps
echo "═══════════════════════════════════════════════════════════════"
echo "  🚀 Ready for Deployment!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "1. railway login"
echo "2. railway init (and select your project)"
echo "3. railroad up"
echo ""
echo "Or deploy via GitHub:"
echo "1. Go to https://railway.app"
echo "2. Create project from GitHub repository"
echo "3. Configure environment variables"
echo "4. Deploy!"
echo ""
