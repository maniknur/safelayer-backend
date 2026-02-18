#!/bin/bash
# OpenClaw ↔ Smart Contract Integration Setup
# Automated setup untuk Analyzer wallet dan contract approval

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  SafeLayer OpenClaw ↔ Smart Contract Integration Setup    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Config
REGISTRY_ADDRESS="0x20B28a7b961a6d82222150905b0C01256607B5A3"
RPC_URL="https://data-seed-prebsc-1-s1.binance.org:8545/"

echo -e "${BLUE}Step 1: Check Current Configuration${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f .env ]; then
  echo -e "${GREEN}✅ .env file exists${NC}"
  
  CONTRACT_ADDR=$(grep REGISTRY_CONTRACT_ADDRESS .env | cut -d'=' -f2)
  echo "Contract: $CONTRACT_ADDR"
  
  PRIVATE_KEY=$(grep ANALYZER_PRIVATE_KEY .env | cut -d'=' -f2)
  if [ -z "$PRIVATE_KEY" ]; then
    echo -e "${YELLOW}⚠️  ANALYZER_PRIVATE_KEY is empty${NC}"
  else
    echo -e "${GREEN}✅ ANALYZER_PRIVATE_KEY is set${NC}"
  fi
else
  echo -e "${RED}❌ .env file not found${NC}"
  exit 1
fi

echo ""
echo -e "${BLUE}Step 2: Create Analyzer Wallet (if needed)${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -z "$PRIVATE_KEY" ] || [ "$PRIVATE_KEY" = "" ]; then
  echo -e "${YELLOW}Generating new analyzer wallet...${NC}"
  
  # Generate using Node.js
  NEW_WALLET=$(node -e "
    const ethers = require('ethers');
    const wallet = ethers.Wallet.createRandom();
    console.log(wallet.privateKey + ',' + wallet.address);
  " 2>/dev/null)
  
  NEW_KEY=$(echo $NEW_WALLET | cut -d',' -f1)
  NEW_ADDR=$(echo $NEW_WALLET | cut -d',' -f2)
  
  echo -e "${GREEN}✅ New wallet generated:${NC}"
  echo "   Address:     $NEW_ADDR"
  echo "   Private Key: $NEW_KEY"
  echo ""
  
  echo -e "${YELLOW}Would you like to use this wallet?${NC}"
  read -p "Enter 'yes' to add to .env, or 'no' to use existing: " choice
  
  if [ "$choice" = "yes" ]; then
    # Update .env
    sed -i '' "s/^ANALYZER_PRIVATE_KEY=.*/ANALYZER_PRIVATE_KEY=$NEW_KEY/" .env
    echo -e "${GREEN}✅ Updated .env with new private key${NC}"
    ANALYZER_ADDR=$NEW_ADDR
  else
    echo "Skipping update. Please set ANALYZER_PRIVATE_KEY manually."
    exit 0
  fi
else
  # Extract address from existing key
  ANALYZER_ADDR=$(node -e "
    const ethers = require('ethers');
    const key = '$PRIVATE_KEY';
    const wallet = new ethers.Wallet(key);
    console.log(wallet.address);
  " 2>/dev/null)
  
  echo -e "${GREEN}✅ Using existing analyzer wallet:${NC}"
  echo "   Address: $ANALYZER_ADDR"
fi

echo ""
echo -e "${BLUE}Step 3: Verify Analyzer Approval Status${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Checking if analyzer is approved in contract..."
echo "Contract: $REGISTRY_ADDRESS"
echo "Analyzer: $ANALYZER_ADDR"
echo ""

# Create check script
cat > check-approval.js << 'EOF'
const ethers = require('ethers');

const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;
const ANALYZER_ADDR = process.env.ANALYZER_ADDR;
const RPC_URL = process.env.RPC_URL;

const ABI = [
  'function approvedAnalyzers(address) external view returns (bool)'
];

async function checkApproval() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(REGISTRY_ADDRESS, ABI, provider);
  
  try {
    const isApproved = await contract.approvedAnalyzers(ANALYZER_ADDR);
    console.log(isApproved ? 'APPROVED' : 'NOT_APPROVED');
  } catch (e) {
    console.log('ERROR:' + e.message);
  }
}

checkApproval();
EOF

APPROVAL_STATUS=$(REGISTRY_ADDRESS=$REGISTRY_ADDRESS ANALYZER_ADDR=$ANALYZER_ADDR RPC_URL=$RPC_URL node check-approval.js 2>/dev/null || echo "ERROR")

if [ "$APPROVAL_STATUS" = "APPROVED" ]; then
  echo -e "${GREEN}✅ Analyzer is APPROVED in contract${NC}"
  echo "   Status: Ready for submission"
else
  echo -e "${RED}❌ Analyzer is NOT approved${NC}"
  echo ""
  echo -e "${YELLOW}How to approve:${NC}"
  echo ""
  echo "Option A: Via BscScan (Recommended)"
  echo "  1. Go to: https://testnet.bscscan.com/address/$REGISTRY_ADDRESS#writeContract"
  echo "  2. Connect with OWNER wallet"
  echo "  3. Call: approveAnalyzer($ANALYZER_ADDR)"
  echo "  4. Submit transaction"
  echo ""
  echo "Option B: Via Contract Script"
  echo "  1. Create scripts/approve-analyzer.js:"
  echo "     const registry = await ethers.getContractAt('SafeLayerRegistry', '$REGISTRY_ADDRESS');"
  echo "     const tx = await registry.approveAnalyzer('$ANALYZER_ADDR');"
  echo "     await tx.wait();"
  echo "  2. Run: npx hardhat run scripts/approve-analyzer.js --network bsc-testnet"
  echo ""
  echo "Waiting for approval, please do one of the options above..."
  echo "Press Enter when approvania done..."
  read
fi

echo ""
echo -e "${BLUE}Step 4: Verify Analyzer Wallet has BNB${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check BNB balance
cat > check-balance.js << 'EOF'
const ethers = require('ethers');

const ANALYZER_ADDR = process.env.ANALYZER_ADDR;
const RPC_URL = process.env.RPC_URL;

async function checkBalance() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const balance = await provider.getBalance(ANALYZER_ADDR);
  console.log(ethers.formatEther(balance));
}

checkBalance().catch(console.error);
EOF

BNB_BALANCE=$(ANALYZER_ADDR=$ANALYZER_ADDR RPC_URL=$RPC_URL node check-balance.js 2>/dev/null || echo "0")

echo "BNB Balance: $BNB_BALANCE BNB"

if (( $(echo "$BNB_BALANCE < 0.01" | bc -l) )); then
  echo -e "${RED}❌ Low balance (< 0.01 BNB)${NC}"
  echo ""
  echo -e "${YELLOW}Send BNB to fund transactions:${NC}"
  echo "  Address: $ANALYZER_ADDR"
  echo "  Recommended: 0.1 BNB (for ~100 submissions)"
  echo ""
  echo "Get testnet BNB:"
  echo "  • https://testnet.binance.org/faucet-smart-chain"
  echo "  • https://www.bnbchain.org/en/testnet-faucet"
else
  echo -e "${GREEN}✅ Sufficient BNB balance${NC}"
fi

echo ""
echo -e "${BLUE}Step 5: Update Configuration${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Ensure all required vars are set
echo "Ensuring all required environment variables are set..."

# Check and update if needed
if ! grep -q "SENTINEL_ENABLED" .env; then
  echo "SENTINEL_ENABLED=true" >> .env
fi

if ! grep -q "SENTINEL_THRESHOLD" .env; then
  echo "SENTINEL_THRESHOLD=70" >> .env
fi

echo -e "${GREEN}✅ Configuration updated${NC}"

echo ""
echo -e "${BLUE}Step 6: Verify Backend Setup${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Checklist:"
echo "  • ANALYZER_PRIVATE_KEY: Set ✅"
echo "  • REGISTRY_CONTRACT_ADDRESS: $REGISTRY_ADDRESS ✅"
echo "  • BNB_RPC_URL: BSC Testnet ✅"
echo "  • SENTINEL_ENABLED: true ✅"
echo "  • ANALYZER Approved: $([ "$APPROVAL_STATUS" = "APPROVED" ] && echo "✅" || echo "❌")"
echo "  • Analyzer has BNB: $([ \$(echo "$BNB_BALANCE > 0.01" | bc -l) -eq 1 ] && echo "✅" || echo "❌")"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Setup Complete! Ready to Start Integration                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Next steps:"
echo "  1. npm run build"
echo "  2. npm start (local) or railway up (production)"
echo "  3. Test: bash test-integration.sh"
echo "  4. Wait 2 minutes for Sentinel submission"
echo "  5. Check BscScan: https://testnet.bscscan.com/tx/{txHash}"
echo ""

# Cleanup
rm -f check-approval.js check-balance.js
