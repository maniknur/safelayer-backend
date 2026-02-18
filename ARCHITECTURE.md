/**
 * OpenClaw Architecture Diagram
 */

# OpenClaw Autonomous Risk Agents - Architecture Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          SafeLayer Backend                              │
│                        (Node.js + Express)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────── API Layer ───────────────────────┐ │
│  │                                                                    │ │
│  │  POST /api/guardian/check        (Protection Gate)               │ │
│  │  GET  /api/guardian/status       (Guardian metrics)              │ │
│  │  GET  /api/agents/status         (All agents status)             │ │
│  │  (Existing: /api/risk, /api/registry, /health)                   │ │
│  │                                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│           ▲              ▲              ▲              ▲                  │
│           │              │              │              │                  │
│  ┌────────┴──────────────┴──────────────┴──────────────┴────────────┐   │
│  │                     Express Router                               │   │
│  │  guardian.ts  /  routes integration                              │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│           ▲                                                               │
│           │                                                               │
│  ┌────────┴────────────────────── OpenClaw Agents ──────────────────────┐ │
│  │                                                                     │ │
│  │  ┌──────────────────────────┐      ┌─────────────────────────┐   │ │
│  │  │   Risk Sentinel (S)      │      │   Risk Guardian (RG)    │   │ │
│  │  └──────────────────────────┘      └─────────────────────────┘   │ │
│  │   Features:                        Features:                     │ │
│  │   • Autonomous                     • Request-response            │ │
│  │   • Interval-based                 • Stateless                   │ │
│  │   • Monitoring loop                • Fast response               │ │
│  │   • Watchlist tracking             • Explainable output          │ │
│  │   • Memory cache                   • Fail-safe design            │ │
│  │   • Onchain submission             • Rate limit aware            │ │
│  │                                                                     │ │
│  │  ┌──────────────────────────┐      ┌─────────────────────────┐   │ │
│  │  │  Decision Engine (DE)    │      │  OpenClaw Manager       │   │ │
│  │  └──────────────────────────┘      └─────────────────────────┘   │ │
│  │   Functions:                       Functions:                    │ │
│  │   • decideOnRisk()                 • initialize()                │ │
│  │   • getConfidence()                • startAll()                  │ │
│  │   • generateReasoning()            • stopAll()                   │ │
│  │   • formatDecisionLog()            • getStatus()                 │ │
│  │                                    • getSentinel()               │ │
│  │                                    • getGuardian()               │ │
│  │  Both agents use DE                Singleton pattern             │ │
│  │                                                                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│           ▲                          ▲                                    │
│           │                          │                                    │
│  ┌────────┴──────────────┬───────────┴────────────────────────────────┐  │
│  │                       │                                            │  │
│  │   ┌─────────────────┬─┴──┐         ┌──────────────────────┐       │  │
│  │   │ RiskIntelligence │   │         │  RegistryService    │       │  │
│  │   │  Engine (RIE)    │   │         │                      │       │  │
│  │   └─────────────────┬─┬──┘         └──────────────────────┘       │  │
│  │                     │ │                       ▲                   │  │
│  │ ┌───────────────────┘ │             ┌─────────┴──────────┐       │  │
│  │ │ Analyzers:        └─────────────┐ │  Contract         │       │  │
│  │ │ • Contract          RIE uses S  │ │  Submission       │       │  │
│  │ │ • Behavior                      │ │                   │       │  │
│  │ │ • Wallet            de uses RIE │ ERS uses reg        │       │  │
│  │ │ • Transparency      to analyze  │                     │       │  │
│  │ │ • Scam Database                 │                     │       │  │
│  │ └───────────────────────────────────┘                     │       │  │
│  │                                                            │       │  │
│  └────────────────────────────────────────────────────────────┴───────┘  │
│                          ▲                          │                     │
└──────────────────────────┼──────────────────────────┼─────────────────────┘
                           │                          │
           BNB Chain RPC   │                          │   SafeLayerRegistry
           (data source)   │                          │   Smart Contract
                           │                          │
                    ┌──────┴──────────────────┬───────┴─────────┐
                    │                         │                 │
              ┌─────▼─────────────────┐  ┌───▼──────────────┐  │
              │  Block Data           │  │  reportHash()    │  │
              │  • Transactions       │  │  submitReport()  │  │
              │  • Contracts          │  │  getStatus()     │  │
              │  • Events             │  │                  │  │
              └───────────────────────┘  └──────────────────┘  │
                                                                │
                                         Onchain Proof         │
                                    (keccak256 hash of         │
                                     risk analysis)            │
```

## Data Flow Diagrams

### Sentinel Flow (Background Process)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Sentinel Monitoring Cycle                    │
│                   Runs Every 2 Minutes                          │
└─────────────────────────────────────────────────────────────────┘

1. OBSERVE PHASE
   ┌────────────────────────┐
   │ Timer Triggers         │  ← Every 2 minutes (SENTINEL_INTERVAL)
   └───────────┬────────────┘
               │
   ┌───────────▼────────────────────────────────────┐
   │ Get Watched Addresses from Cache               │
   │ (added via addWatchAddress() or previous runs) │
   └───────────┬────────────────────────────────────┘
               │
   ┌───────────▼────────────────────────────────────┐
   │ For Each Address:                              │
   │ • Call RiskIntelligenceEngine.analyze()        │
   │ • Get risk_score, risk_level, breakdown        │
   └───────────┬────────────────────────────────────┘
               │

2. DECIDE PHASE
   ┌───────────▼────────────────────────────────────┐
   │ For Each Risk Result:                          │
   │ • Call DecisionEngine.decideOnRisk()           │
   │ • Compare score vs SENTINEL_THRESHOLD          │
   │ • Get decision: ALLOW/WARN/BLOCK               │
   └───────────┬────────────────────────────────────┘
               │
   ┌───────────▼────────────────────────────────────┐
   │ Evaluate: Should Submit to Chain?              │
   │ IF score >= threshold && not recently submitted│
   └───────────┬────────────────────────────────────┘
               │

3. ACT PHASE
   ┌───────────▼─────────────────────────────────────┐
   │ IF Decision = SUBMIT:                           │
   │ • Create report hash (keccak256)                │
   │ • Call registryService.submitReport()           │
   │ → Sends transaction to SafeLayerRegistry        │
   │ → Gets tx hash back                             │
   │ → Updates alert cache                           │
   │ • Log submission (tx hash, block number)        │
   └───────────┬─────────────────────────────────────┘
               │
   ┌───────────▼─────────────────────────────────────┐
   │ Update Alert Cache:                             │
   │ • Store/update alert for address                │
   │ • Track submission status                       │
   │ • Maintain max 100 alerts                       │
   └───────────┬─────────────────────────────────────┘
               │
   ┌───────────▼─────────────────────────────────────┐
   │ Log Results:                                    │
   │ {                                               │
   │   agent: "RiskSentinel",                        │
   │   target: "0x...",                              │
   │   score: 82,                                    │
   │   action: "SUBMITTED",                          │
   │   txHash: "0x...",                              │
   │   duration: "1.5s"                              │
   │ }                                               │
   └───────────┬─────────────────────────────────────┘
               │
   ┌───────────▼─────────────────────────────────────┐
   │ Sleep until next interval                       │
   └───────────────────────────────────────────────────┘
```

### Guardian Flow (Request-Response)

```
┌─────────────────────────────────────────────────────────────────┐
│              Guardian Protection Check                          │
│         Real-time Response to User Request                      │
└─────────────────────────────────────────────────────────────────┘

User/Frontend Request
        │
        │  POST /api/guardian/check
        │  { targetAddress: "0x..." }
        │
        ▼
1. VALIDATE
   ┌──────────────────────────┐
   │ • Check address format   │
   │ • Normalize address      │
   │ • Reject if invalid      │
   └──────────┬───────────────┘
              │

2. OBSERVE (Analysis)
   ┌──────────────────────────────────┐
   │ Call RiskIntelligenceEngine:      │
   │ • Full risk analysis              │
   │ • May hit cache (2 min TTL)       │
   │ • Get: score, level, breakdown    │
   └──────────┬───────────────────────┘
              │

3. DECIDE (Protection Decision)
   ┌──────────────────────────────────┐
   │ Call DecisionEngine.decideOnRisk()│
   │ • Compare score vs threshold      │
   │ • Calculate confidence            │
   │ • Generate reasoning              │
   │ • Get decision object             │
   └──────────┬───────────────────────┘
              │

4. RESPOND (API Response)
   ┌────────────────────────┐
   │ IF score >= threshold: │
   │ {                      │
   │   allowed: false,      │
   │   level: "BLOCK",      │
   │   action: "BLOCK",     │
   │   score: 82,           │
   │   reasoning: "...",    │
   │   confidence: "high"   │
   │ }                      │
   │                        │
   │ ELSE:                  │
   │ {                      │
   │   allowed: true,       │
   │   level: "ALLOW",      │
   │   action: "ALLOW",     │
   │   score: 25,           │
   │   reasoning: "...",    │
   │   confidence: "high"   │
   │ }                      │
   └────────────┬───────────┘
                │
                ▼
        User/Frontend Gets:
        HTTP 200 + JSON Decision
        Can now proceed or block
        interaction accordingly
```

## Component Interaction Diagram

```
User/App
   │
   │ POST /api/guardian/check
   │
   ▼
┌─────────────────────────┐
│  Express Route Handler  │
│  (routes/guardian.ts)   │
└────────┬────────────────┘
         │
         │ Creates check request
         │
         ▼
    ┌─────────────────────────────────┐
    │  RiskGuardian.checkAddress()    │
    │  (openclaw/guardian.ts)         │
    └────┬────────────────┬───────────┘
         │                │
         │ Calls          │ Calls
         │                │
         ▼                ▼
   ┌──────────────┐  ┌──────────────────────────┐
   │    RIE       │  │  DecisionEngine          │
   │  analyze()   │  │  decideOnRisk()          │
   │              │  │  getConfidence()         │
   │ Returns:     │  │  generateReasoning()     │
   │ risk_score   │  │                          │
   │ risk_level   │  │ Returns:                 │
   │ breakdown    │  │ {level, allowed, score,  │
   └──────┬───────┘  │  reasoning, confidence}  │
          │          └──────────┬────────────────┘
          │                     │
          └─────────────┬───────┘
                        │
                        ▼
          ┌──────────────────────────┐
          │  Format API Response     │
          │  (guardian.ts)           │
          └────────┬─────────────────┘
                   │
                   ▼
              HTTP 200 JSON
                   │
                   ▼
              User/Frontend
```

## State & Data Flow

### Sentinel State
```
RiskSentinel Instance
│
├─ config: SentinelConfig          ← From environment
│   ├─ enabled: boolean
│   ├─ interval: number (ms)
│   ├─ threshold: number (0-100)
│   ├─ maxAlerts: number
│   └─ blockBatchSize: number
│
├─ running: boolean                ← Start/stop flag
├─ intervalHandle: NodeJS.Timeout  ← Timer reference
│
├─ Alerts Cache
│   └─ alerts: Map<address, RiskAlert>  ← Max 100
│       └─ Each: { id, target, score, level, txHash, timestamp }
│
├─ Deduplication
│   └─ submittedAlerts: Set<string>  ← Prevent double submit
│
└─ Metrics
    ├─ runsTotal: number
    ├─ successfulRuns: number
    ├─ errorsTotal: number
    └─ submissionsToChain: number
```

### Guardian State
```
RiskGuardian Instance
│
├─ config: GuardianConfig          ← From environment
│   ├─ enabled: boolean
│   ├─ threshold: number (0-100)
│   └─ strictMode: boolean
│
├─ running: boolean                ← Always true once started
│
└─ Metrics (Read-Only)
    ├─ checksTotal: number         ← All requests processed
    ├─ blockedCount: number        ← Times returned allowed=false
    ├─ allowedCount: number        ← Times returned allowed=true
    └─ errorsTotal: number         ← Times analysis failed
```

## Security & Bounds

```
Memory Bounds:
├─ Sentinel Alerts: Max 100         ← Prevent unbounded growth
│
Cache:
├─ Risk Analysis: 2 min TTL        ← Existing system cache
│
Rate Limiting:
├─ Per IP: 30 req/min              ← Existing system
│
Error Handling:
├─ Guardian: Blocks if analysis fails
├─ Sentinel: Logs error, continues
│
Deduplication:
├─ Sentinel: Tracks submitted hashes
└─ Avoids redundant onchain submissions
```

## Deployment Topology

```
Production (Railway)
│
└─ Node.js Process
   │
   ├─ Express Server (port 3001)
   │  │
   │  ├─ Guardian Routes (Stateless)
   │  │  └─ Scales with requests
   │  │
   │  ├─ Existing Risk Routes
   │  │  └─ Shares RiskIntelligenceEngine
   │  │
   │  └─ Agent Status Endpoints
   │
   └─ OpenClaw Agents (Background)
      │
      ├─ RiskSentinel (Timer-based)
      │  └─ Interval task, uses shared RIE
      │
      └─ RiskGuardian (Stateless)
         └─ Event-driven by requests
```

---

This architecture ensures:
✅ **Modularity:** Each component has single responsibility
✅ **Scalability:** Guardian is stateless; Sentinel memory-bounded
✅ **Reliability:** Graceful error handling, bounded resources
✅ **Observability:** Status endpoints, structured logging
✅ **Integration:** Clean Express integration, no breaking changes
