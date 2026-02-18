/**
 * ███████╗ █████╗ ███████╗███████╗██╗      █████╗ ██╗   ██╗███████╗██████╗
 * ██╔════╝██╔══██╗██╔════╝██╔════╝██║     ██╔══██╗╚██╗ ██╔╝██╔════╝██╔══██╗
 * ███████╗███████║█████╗  █████╗  ██║     ███████║ ╚████╔╝ █████╗  ██████╔╝
 * ╚════██║██╔══██║██╔══╝  ██╔══╝  ██║     ██╔══██║  ╚██╔╝  ██╔══╝  ██╔══██╗
 * ███████║██║  ██║███████╗███████╗███████╗██║  ██║   ██║   ███████╗██║  ██║
 * ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
 *
 * OpenClaw Autonomous Risk Agents™
 * 
 * Two intelligent agents protecting SafeLayer users on BNB Chain:
 * → Risk Sentinel: Autonomous monitoring agent
 * → Risk Guardian: Interactive protection gate
 */

# OpenClaw Autonomous Risk Agents

SafeLayer integrates two **OpenClaw-style autonomous agents** that implement the **observe → decide → act** pattern for explainable risk intelligence.

## Architecture Overview

```
Backend (Node.js + Express + TypeScript)
├── RiskIntelligenceEngine     (Core analysis module)
├── OpenClaw Agents
│   ├── RiskSentinel           (Autonomous Monitor)
│   ├── RiskGuardian           (Protection Gate)
│   ├── DecisionEngine         (Decision Logic)
│   └── Manager                (Lifecycle Control)
├── SafeLayerRegistry          (Onchain Smart Contract)
└── API Routes
    ├── /api/risk              (Intelligence analysis)
    ├── /api/guardian/check    (Protection checks)
    └── /api/agents/status     (Agent monitoring)
```

---

## 1️⃣ Risk Sentinel (Autonomous Monitor)

### Purpose
Continuously monitors BNB Chain for high-risk contracts and **autonomously** submits findings to the SafeLayerRegistry smart contract.

### How It Works

**OBSERVE → DECIDE → ACT Pattern:**

```typescript
1. OBSERVE (Data Collection)
   └─ Monitor watched addresses
   └─ Call RiskIntelligenceEngine.analyze()
   
2. DECIDE (Risk Decision)
   └─ Compare score against threshold
   └─ Determine action level (ALLOW | WARN | BLOCK)
   
3. ACT (Submission)
   └─ Hash risk report with keccak256
   └─ Submit to SafeLayerRegistry contract
   └─ Cache alert internally
```

### OpenClaw Qualifications

✅ **Autonomous**: Runs autonomously on configurable interval (default 2 minutes)  
✅ **Observable**: Emits structured logs for every decision  
✅ **Decidable**: Uses decision engine for risk classification  
✅ **Verifiable**: Submits immutable proof (hash) onchain  
✅ **Deduplicates**: Avoids duplicate submissions with in-memory cache  

### Configuration

```env
SENTINEL_ENABLED=true
SENTINEL_INTERVAL=120000          # Check every 2 minutes
SENTINEL_THRESHOLD=70             # Block if score >= 70
SENTINEL_MAX_ALERTS=100           # Keep 100 alerts in memory
SENTINEL_BATCH_SIZE=10            # Check up to 10 addresses per cycle
```

### Usage

Add an address to Sentinel's watchlist:

```typescript
import { getOpenClawManager } from './openclaw';

const manager = getOpenClawManager();
manager.addToSentinelWatch('0x10ed43c718714eb63d5aa57b78b54704e256024e');
```

### Example Output

```json
{
  "agent": "RiskSentinel",
  "target": "0x10ed43c718714eb63d5aa57b78b54704e256024e",
  "action": "SUBMITTED",
  "risk_score": 82,
  "tx_hash": "0x1234...",
  "timestamp": "2026-02-18T22:08:59.000Z"
}
```

---

## 2️⃣ Risk Guardian (Protection Gate)

### Purpose
Provides **real-time protection decisions** for user interactions with smart contracts. Users request a risk check before interacting with a contract, Guardian responds with ALLOW/WARN/BLOCK.

### How It Works

**REQUEST → OBSERVE → DECIDE → RESPOND Pattern:**

```typescript
User Request:
  POST /api/guardian/check
  { "targetAddress": "0x..." }
  
1. OBSERVE (Analysis)
   └─ Run RiskIntelligenceEngine
   └─ Get full risk breakdown
   
2. DECIDE (Protection Decision)
   └─ Compare against threshold
   └─ Determine action: ALLOW | WARN | BLOCK
   
3. RESPOND (API Response)
   └─ Return decision + confidence + reasoning
   └─ User can proceed or block interaction
```

### OpenClaw Qualifications

✅ **Stateless**: Each request is independent (can handle massive throughput)  
✅ **Observable**: Logs every protection decision  
✅ **Explainable**: Includes reasoning and confidence scores  
✅ **Graceful Failure**: Fails safely (blocks if analysis fails)  
✅ **Fast**: Leverages existing risk cache when available  

### Configuration

```env
GUARDIAN_ENABLED=true
GUARDIAN_THRESHOLD=60             # Block if score >= 60
GUARDIAN_STRICT_MODE=false        # false: WARN at threshold; true: BLOCK
```

### API Endpoints

#### Check Address Protection

```bash
curl -X POST http://localhost:3001/api/guardian/check \
  -H "Content-Type: application/json" \
  -d '{
    "targetAddress": "0x10ed43c718714eb63d5aa57b78b54704e256024e"
  }'
```

**Response (Safe Contract):**
```json
{
  "success": true,
  "data": {
    "allowed": true,
    "level": "ALLOW",
    "recommended_action": "ALLOW",
    "riskScore": 25,
    "reasoning": "Risk score 25 within acceptable range. Contract appears safe.",
    "confidence": "high"
  }
}
```

**Response (Risky Contract):**
```json
{
  "success": true,
  "data": {
    "allowed": false,
    "level": "BLOCK",
    "recommended_action": "BLOCK",
    "riskScore": 82,
    "reasoning": "Risk score 82 exceeds threshold 60. Flagged for protection.",
    "confidence": "high"
  }
}
```

#### Get Guardian Status

```bash
curl http://localhost:3001/api/guardian/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "RiskGuardian",
    "enabled": true,
    "running": true,
    "lastRun": 1645268399000,
    "runsTotal": 127,
    "errorsTotal": 2,
    "successRate": 98.43,
    "alertsGenerated": 18,
    "submissionsToChain": 0
  }
}
```

---

## 🔧 Decision Engine

Core decision logic that classifies risk:

```typescript
Risk Score → Decision Level:
  0-29   → ALLOW   (Safe to proceed)
  30-59  → WARN    (Elevated activity)
  60-100 → BLOCK   (High risk, protection recommended)

Confidence (varies by proximity to threshold):
  Distance > 30  → high
  Distance 15-30 → medium
  Distance < 15  → low
```

### Decision Output

```typescript
interface RiskDecision {
  level: 'ALLOW' | 'WARN' | 'BLOCK';
  allowed: boolean;
  recommended_action: 'ALLOW' | 'WARN' | 'BLOCK';
  confidence: 'low' | 'medium' | 'high';
  riskScore: number;
  reasoning: string;
  timestamp: number;
}
```

---

## 📊 Agent Monitoring

All agents expose status via:

```bash
curl http://localhost:3001/api/agents/status
```

**Response:**
```json
{
  "success": true,
  "agents": {
    "RiskSentinel": {
      "name": "RiskSentinel",
      "enabled": true,
      "running": true,
      "lastRun": 1645268399000,
      "runsTotal": 153,
      "errorsTotal": 1,
      "successRate": 99.35,
      "alertsGenerated": 24,
      "submissionsToChain": 18
    },
    "RiskGuardian": {
      "name": "RiskGuardian",
      "enabled": true,
      "running": true,
      "lastRun": 1645268412000,
      "runsTotal": 432,
      "errorsTotal": 3,
      "successRate": 99.31,
      "alertsGenerated": 87,
      "submissionsToChain": 0
    }
  },
  "timestamp": "2026-02-18T22:09:30.000Z"
}
```

---

## 🚀 Getting Started

### 1. Configure Agents

Edit `.env`:

```env
# Enable both agents
SENTINEL_ENABLED=true
GUARDIAN_ENABLED=true

# Sentinel settings
SENTINEL_INTERVAL=120000          # 2 minutes
SENTINEL_THRESHOLD=70             # 0-100

# Guardian settings
GUARDIAN_THRESHOLD=60             # 0-100
GUARDIAN_STRICT_MODE=false
```

### 2. Start Backend

```bash
npm run dev
```

Server logs will show:

```
[OpenClaw] Sentinel configured { 
  enabled: true, 
  interval: 120000, 
  threshold: 70 
}
[OpenClaw] Guardian configured { 
  enabled: true, 
  threshold: 60, 
  strictMode: false 
}
[OpenClaw] All agents started successfully
```

### 3. Check Guardian

```bash
curl -X POST http://localhost:3001/api/guardian/check \
  -H "Content-Type: application/json" \
  -d '{"targetAddress": "0x10ed43c718714eb63d5aa57b78b54704e256024e"}'
```

### 4. Monitor Agents

```bash
curl http://localhost:3001/api/agents/status
```

---

## 🎯 Hackathon Alignment

**How SafeLayer's OpenClaw Agents Meet Framework Requirements:**

### ✅ Autonomous Decision-Making
- **Sentinel**: Monitors autonomously on timer, no user intervention
- **Guardian**: Makes instant decisions without human approval
- **Decision Engine**: Deterministic scoring based on evidence

### ✅ Observe → Decide → Act Pattern
```
SENTINEL:
  Observe:  Run RiskIntelligenceEngine
  Decide:   Compare score vs threshold
  Act:      Submit to SafeLayerRegistry + alert cache

GUARDIAN:
  Observe:  Analyze target address
  Decide:   Make protection decision
  Act:      Return structured response
```

### ✅ Explainability
- Every decision includes `reasoning` field
- Confidence scores show decision certainty
- Evidence flags and risk categories breakdown
- Risk score calculation transparency

### ✅ Verifiability
- Sentinel submits onchain proofs (keccak256 hash)
- Registry contract records all submissions immutably
- Decisions logged with timestamps and addresses

### ✅ Graceful Error Handling
- Sentinel deduplicates submissions
- Guardian fails safely (blocks if analysis fails)
- Bounded memory (max 100 alerts)
- RPC errors logged but don't crash service

---

## 📝 Logging

All agent actions produce structured logs:

```
[RiskSentinel] Starting monitoring cycle
[RiskSentinel] Monitoring 5 addresses
[RiskSentinel] Submitted to registry
  target: 0x10ed...
  score: 82
  txHash: 0x1234...
  
[RiskGuardian] Checking address protection
[RiskGuardian] Protection check complete
  target: 0x10ed...
  score: 25
  decision: ALLOW
  duration: 245ms
```

---

## 🔐 Security Notes

- **Sentinel Private Key**: Only needed for onchain submission. Keep it secure!
  ```env
  ANALYZER_PRIVATE_KEY=your_secure_key_only
  ```
  
- **Rate Limits**: Backend enforces 30 req/min per IP (configurable)

- **Memory Bounded**: Default 100 alerts max to prevent memory leaks

---

## 📦 Deployment (Railway.app)

Agents start automatically when backend boots:

```bash
npm run build  # TypeScript → JavaScript
npm start      # Run compiled code
```

Railway will initialize OpenClaw manager and start both agents.

---

## 🎓 Code Structure

```
src/openclaw/
├── types.ts          # Agent interfaces & types
├── decisionEngine.ts # Core decision logic
├── sentinel.ts       # Autonomous monitor
├── guardian.ts       # Protection gate
└── index.ts          # Manager & factory

src/routes/
└── guardian.ts       # API endpoints

src/app.ts           # Express app integration
src/index.ts         # Agent initialization
```

---

## 🚦 Status & Monitoring

Check agent health:

```bash
# Get all agents status
curl http://localhost:3001/api/agents/status

# Get Sentinel alerts
curl http://localhost:3001/api/sentinel/alerts (future)

# Get Guardian checks  
curl http://localhost:3001/api/guardian/status
```

---

**Built for SafeLayer Hackathon | BNB Chain | 2026**
