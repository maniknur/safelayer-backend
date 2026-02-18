/**
 * SafeLayer Risk Intelligence Engine - Core Types
 * Evidence-based risk assessment types for production-grade security analysis
 */

// ─── Risk Levels ───────────────────────────────────────────────────────────
export type RiskLevel = 'Very Low' | 'Low' | 'Medium' | 'High' | 'Very High';
export type AddressType = 'wallet' | 'contract' | 'token';
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

// ─── Evidence Flag ─────────────────────────────────────────────────────────
export interface EvidenceFlag {
  id: string;
  name: string;
  severity: Severity;
  description: string;
  evidence: string;
  category: string;
  source?: string;          // e.g. "BscScan", "RPC", "PancakeSwap"
  codeSnippet?: string;     // source code excerpt if available
  bscscanLink?: string;     // link to BscScan for verification
  riskWeight: number;       // 0-100 contribution to category score
}

// ─── Contract Analysis ─────────────────────────────────────────────────────
export interface ContractAnalysis {
  isContract: boolean;
  isVerified: boolean;
  codeSize: number;
  compilerVersion?: string;
  sourceCodeAvailable: boolean;
  flags: EvidenceFlag[];
  score: number;            // 0-100
  detections: {
    ownerPrivileges: boolean;
    withdrawFunctions: boolean;
    mintFunctions: boolean;
    proxyPattern: boolean;
    noRenounceOwnership: boolean;
    upgradeability: boolean;
    selfDestruct: boolean;
    honeypotLogic: boolean;
  };
}

// ─── On-Chain Behavior ─────────────────────────────────────────────────────
export interface OnChainIndicator {
  indicator: string;
  evidence: string;
  riskWeight: number;
}

export interface OnChainBehaviorAnalysis {
  flags: EvidenceFlag[];
  indicators: OnChainIndicator[];
  score: number;            // 0-100
  metrics: {
    topHolderConcentration: number | null;  // percentage
    contractAgeDays: number | null;
    holderCount: number | null;
    transactionCount: number;
    balance: string;
    liquidityBNB: string | null;
    hasDexPair: boolean;
    rugPullRisk: number;    // 0-100
  };
}

// ─── Wallet History ────────────────────────────────────────────────────────
export interface WalletHistoryAnalysis {
  flags: EvidenceFlag[];
  score: number;            // 0-100
  deployedContracts: string[];
  linkedRugpulls: string[];
  fundFlowSummary: string;
  isContract: boolean;
  transactionCount: number;
  ageInDays: number;
  balanceBNB: string;
}

// ─── Transparency ──────────────────────────────────────────────────────────
export interface TransparencyAnalysis {
  flags: EvidenceFlag[];
  score: number;            // 0-100
  github: {
    found: boolean;
    repoUrl?: string;
    lastCommitDate?: string;
    contributorsCount?: number;
    starsCount?: number;
  };
  audit: {
    detected: boolean;
    auditorName?: string;
    reportUrl?: string;
  };
  teamDoxxed: boolean;
}

// ─── Scam Database ─────────────────────────────────────────────────────────
export interface ScamDatabaseAnalysis {
  flags: EvidenceFlag[];
  score: number;            // 0-100
  isBlacklisted: boolean;
  knownScam: boolean;
  rugpullHistory: boolean;
  matchedDatabase: string[];  // names of databases that flagged this
}

// ─── Risk Breakdown ────────────────────────────────────────────────────────
export interface RiskBreakdown {
  contract_risk: number;    // 0-100
  behavior_risk: number;    // 0-100
  reputation_risk: number;  // 0-100
}

// ─── Score Calculation Transparency ────────────────────────────────────────
export interface ScoreCalculation {
  formula: string;
  weights: {
    contract_risk: number;
    behavior_risk: number;
    reputation_risk: number;
  };
  rawScores: {
    contract_risk: number;
    behavior_risk: number;
    reputation_risk: number;
  };
  adjustments: string[];    // floor rules, flag boosts applied
  finalScore: number;
}

// ─── Full Risk Intelligence Response ───────────────────────────────────────
export interface RiskIntelligenceResult {
  // Summary
  risk_score: number;       // 0-100
  risk_level: RiskLevel;
  address: string;
  addressType: AddressType;

  // Breakdown
  breakdown: RiskBreakdown;

  // Evidence panels
  evidence: {
    contract_flags: EvidenceFlag[];
    onchain_flags: EvidenceFlag[];
    wallet_flags: EvidenceFlag[];
    transparency_flags: EvidenceFlag[];
    scam_flags: EvidenceFlag[];
  };

  // Detailed analysis results
  analysis: {
    contract: ContractAnalysis;
    onchain: OnChainBehaviorAnalysis;
    wallet: WalletHistoryAnalysis;
    transparency: TransparencyAnalysis;
    scamDatabase: ScamDatabaseAnalysis;
  };

  // Score transparency
  scoreCalculation: ScoreCalculation;

  // On-chain indicators table
  onchainIndicators: OnChainIndicator[];

  // Explanation
  explanation: {
    summary: string;
    keyFindings: string[];
    recommendations: string[];
    riskFactors: string[];
  };

  // Meta
  timestamp: string;
  analysisTimeMs: number;
}
