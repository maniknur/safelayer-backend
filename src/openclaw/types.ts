/**
 * OpenClaw Agent Types
 * 
 * Defines the core data structures for autonomous risk intelligence agents.
 * Follows the observe → decide → act pattern of OpenClaw framework.
 */

// ─── Decision Levels ───
export type DecisionLevel = 'ALLOW' | 'WARN' | 'BLOCK';
export type DecisionConfidence = 'low' | 'medium' | 'high';

/**
 * Decision Output
 * Result of (observe → decide) logic
 */
export interface RiskDecision {
  level: DecisionLevel;
  allowed: boolean;
  recommended_action: 'ALLOW' | 'WARN' | 'BLOCK';
  confidence: DecisionConfidence;
  riskScore: number;
  reasoning: string;
  timestamp: number;
}

/**
 * Agent Action Result
 * Result of (act) logic - what happened after decision
 */
export interface AgentActionResult {
  agent: string;
  target: string;
  action: 'OBSERVATION' | 'DECISION' | 'SUBMITTED' | 'REJECTED' | 'ERROR';
  timestamp: number;
  success: boolean;
  riskScore: number;
  txHash?: string;
  blockNumber?: number;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Alert Entry
 * Stored in memory cache for anomaly alerting
 */
export interface RiskAlert {
  id: string;
  agent: 'RiskSentinel' | 'RiskGuardian';
  target: string;
  riskScore: number;
  level: DecisionLevel;
  reason: string;
  submittedToChain: boolean;
  txHash?: string;
  timestamp: number;
  reportHash?: string;
}

/**
 * Sentinel Configuration
 */
export interface SentinelConfig {
  enabled: boolean;
  interval: number; // milliseconds
  threshold: number; // 0-100
  maxAlerts: number; // Max in-memory alerts
  blockBatchSize: number; // How many blocks to check per run
}

/**
 * Guardian Configuration
 */
export interface GuardianConfig {
  enabled: boolean;
  threshold: number; // 0-100
  strictMode: boolean; // If true, block at threshold; if false, warn
}

/**
 * OpenClaw Agent Interface
 * Defines standard behavior for autonomous agents
 */
export interface OpenClawAgent {
  name: string;
  version: string;
  enabled: boolean;
  
  /**
   * Start the agent (async task initialization)
   */
  start(): Promise<void>;
  
  /**
   * Stop the agent (cleanup)
   */
  stop(): Promise<void>;
  
  /**
   * Get current status
   */
  getStatus(): AgentStatus;
}

/**
 * Agent Status for monitoring
 */
export interface AgentStatus {
  name: string;
  enabled: boolean;
  running: boolean;
  lastRun?: number;
  runsTotal: number;
  errorsTotal: number;
  successRate: number;
  alertsGenerated: number;
  submissionsToChain: number;
}

/**
 * Batch Decision for Sentinel
 * When checking multiple addresses in one run
 */
export interface BatchDecision {
  address: string;
  decision: RiskDecision;
  shouldSubmit: boolean;
}
