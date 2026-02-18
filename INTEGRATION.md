/**
 * OpenClaw ↔ Smart Contract Integration Guide
 */

# 🔗 Backend OpenClaw ↔ Smart Contract Integration

## ✅ Current Status

```
Backend (Node.js + Express)
    ↓
OpenClaw Agents
    ├─ RiskSentinel (Autonomous Monitor)
    └─ RiskGuardian (Protection Gate)
        ↓
RiskIntelligenceEngine (Analysis)
    ↓
registryService.ts (Contract Interaction) ✅
    ↓
SafeLayerRegistry Smart Contract
    Address: 0x20B28a7b961a6d82222150905b0C01256607B5A3
    Network: BSC Testnet
    ↓
Immutable Reports on Blockchain ✅
```

---

## 🎯 How Integration Works

### When User Calls Guardian
```
POST /api/guardian/check { targetAddress: "0x..." }
    ↓
RiskIntelligenceEngine analyzes (full risk assessment)
    ↓
DecisionEngine decides (ALLOW/WARN/BLOCK)
    ↓
API returns decision immediately
```

### When Sentinel Runs (Every 2 Minutes)
```
Background Task Triggered
    ↓
For each monitored address:
    ├─ Analyze risk (same as Guardian)
    ├─ If score >= 70:
    │   ├─ Create report hash (keccak256)
    │   ├─ Call registryService.submitReport()
    │   ├─ Contract receives: submitRiskReport(
    │   │     targetAddress,
    │   │     riskScore,
    │   │     riskLevel,
    │   │     reportHash
    │   │   )
    │   ├─ Smart Contract records report onchain
    │   ├─ RiskReportSubmitted event emitted
    │   └─ Log txHash + block number
    └─ Sleep 2 minutes
```

---

## 📋 Setup Checklist

### 1. ✅ Contract is Deployed
```
Address: 0x20B28a7b961a6d82222150905b0C01256607B5A3
Network: BSC Testnet
Status: Ready for reports
```

### 2. ❌ Analyzer Wallet (NEEDS SETUP)
```env
ANALYZER_PRIVATE_KEY=              ← MUST SET
```

Steps:
```bash
# Run automated setup
bash setup-integration.sh

# This will:
✅ Generate new analyzer wallet (or use existing)
✅ Check approval status in contract
✅ Verify BNB balance for gas
✅ Update .env automatically
```

### 3. ❌ Analyzer Must Be Approved BY CONTRACT OWNER
```solidity
// Owner must call:
registry.approveAnalyzer(analyzerAddress)
```

How:
```
Option A: Via BscScan
  1. https://testnet.bscscan.com/address/0x20B28...#writeContract
  2. Connect with owner wallet
  3. Call: approveAnalyzer(0x...)
  4. Submit

Option B: Hardhat Script
  See INTEGRATION_GUIDE.md (full version)
```

### 4. ⚠️ Analyzer Needs BNB (Gas Fees)
```
Recommended: 0.1 BNB minimum
Get testnet BNB:
  • https://testnet.binance.org/faucet-smart-chain
  • https://www.bnbchain.org/en/testnet-faucet
```

---

## 🚀 Quick Start

### 1. Run Setup
```bash
bash setup-integration.sh
```

Will:
✅ Create/import analyzer wallet  
✅ Check approval status  
✅ Verify BNB balance  
✅ Update .env  

### 2. Start Backend
```bash
npm start
```

### 3. Test Integration
```bash
bash test-integration.sh
```

Expected output:
```
✅ Backend running
✅ Agents status shown
✅ Guardian returns decision
ℹ️ Sentinel will submit in 2 minutes if score > 70
```

### 4. Verify on Blockchain
```
Wait 2 minutes → Check logs:
grep "submitted to registry" logs/*.log

Then verify on BscScan:
https://testnet.bscscan.com/tx/{txHash}
```

---

## 📊 Flow Diagram

```
User/Frontend
    │
    ├─ POST /api/guardian/check
    │         ↓
    │   RiskGuardian analyzes
    │         ↓
    │   Returns decision immediately
    │
    ├─ (In background)
    │
    └─ RiskSentinel monitors (every 2 min)
            ↓
       For each address:
            ├─ Analyze
            ├─ Decision: score >= 70?
            │       YES
            │       ↓
            │   registryService.submitReport()
            │       ↓
            │   Smart Contract receives transaction
            │       ├─ Hash recorded
            │       ├─ Report stored
            │       └─ Event emitted
            │
            └─ Sleep 2 minutes
```

---

## 🔍 Verification

### Check Agent Status
```bash
curl http://localhost:3001/api/agents/status | jq .

# Look for:
# "submissionsToChain": N  ← Count of successful submissions
```

### Check Logs
```bash
# Sentinel submissions
grep -i "submitted" logs/*.log

# Contract interactions
grep -i "registry" logs/*.log
```

### Verify on BscScan
```bash
# After submission, check:
https://testnet.bscscan.com/address/0x20B28...

# Should show:
✅ RiskReportSubmitted events
✅ Transaction success
✅ Gas spent from analyzer wallet
```

---

## ⚡ Key Environment Variables

```env
# Contract
REGISTRY_CONTRACT_ADDRESS=0x20B28a7b961a6d82222150905b0C01256607B5A3
BNB_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/

# Analyzer Wallet (CRITICAL)
ANALYZER_PRIVATE_KEY=0x...          ← SET THIS

# Sentinel Settings
SENTINEL_ENABLED=true                ← Must be true
SENTINEL_THRESHOLD=70                ← Submit if score >= 70
SENTINEL_INTERVAL=120000             ← Check every 2 minutes
```

---

## 🆘 Troubleshooting

### "Analyzer private key not configured"
```
→ Set ANALYZER_PRIVATE_KEY in .env
→ Restart backend
```

### "Submission failed: not approved"
```
→ Contract owner must call approveAnalyzer()
→ Check BscScan: registry.approvedAnalyzers(wallet)
  Should return: true
```

### "Insufficient funds"
```
→ Analyzer wallet needs BNB
→ Send 0.1 BNB to analyzer address
→ Get from testnet faucet
```

### "RPC error: rate limit"
```
→ Try fallback RPC:
   https://bsc-dataseed.binance.org/
→ Or: https://bsc-dataseed1.ninicoin.io/
```

---

## 📚 Full Documentation

See files in backend repo:
- **OPENCLAW_AGENTS.md** - Complete agent documentation
- **ARCHITECTURE.md** - System architecture diagrams
- **INTEGRATION_GUIDE.md** - Detailed setup guide
- **test-integration.sh** - Test script

---

## ✅ Next Steps

1. ✅ Backend is ready (OpenClaw agents running)
2. ⏳ Setup analyzer wallet (use: bash setup-integration.sh)
3. ⏳ Approve analyzer in contract
4. ⏳ Send BNB to analyzer wallet
5. ⏳ Start backend and test

**Ready? Start with:**
```bash
bash setup-integration.sh
```
