/**
 * Decision Engine
 * 
 * Core logic for the observe → decide pattern.
 * Takes risk score and threshold, returns structured decision with confidence.
 * 
 * Implements OpenClaw's decision-making interface.
 */

import type { RiskDecision, DecisionLevel, DecisionConfidence } from './types';

/**
 * Converts risk score to decision level
 * 
 * Risk Intelligence Classification:
 * - 0-30: ALLOW (safe to interact)
 * - 31-59: WARN (proceed with caution)
 * - 60-100: BLOCK (high risk, protection recommended)
 */
function getDecisionLevel(score: number, threshold: number): DecisionLevel {
  if (score < 30) return 'ALLOW';
  if (score < 60) return 'WARN';
  return 'BLOCK';
}

/**
 * Calculate confidence based on distance from threshold
 * Closer to decision boundary = lower confidence
 */
function getConfidence(score: number, threshold: number): DecisionConfidence {
  const distance = Math.abs(score - threshold);
  
  if (distance > 30) return 'high';
  if (distance > 15) return 'medium';
  return 'low';
}

/**
 * Generate human-readable reasoning
 */
function generateReasoning(score: number, threshold: number, level: DecisionLevel): string {
  if (score >= threshold && level === 'BLOCK') {
    return `Risk score ${score} exceeds threshold ${threshold}. Flagged for protection.`;
  }
  
  if (score >= 30 && level === 'WARN') {
    return `Risk score ${score} indicates elevated activity. User should verify legitimacy.`;
  }
  
  return `Risk score ${score} within acceptable range. Contract appears safe.`;
}

/**
 * Core Decision Function
 * 
 * Implements the "decide" step in observe → decide → act pattern.
 * 
 * @param riskScore - Risk score from intelligence engine (0-100)
 * @param threshold - Risk threshold for BLOCK decision (configurable)
 * @returns Structured decision with confidence and reasoning
 */
export function decideOnRisk(riskScore: number, threshold: number): RiskDecision {
  // Validate inputs
  const score = Math.max(0, Math.min(100, riskScore));
  const thresh = Math.max(0, Math.min(100, threshold));

  // Determine action level
  const level = getDecisionLevel(score, thresh);
  const allowed = level === 'ALLOW' || level === 'WARN';
  const confidence = getConfidence(score, thresh);
  const reasoning = generateReasoning(score, thresh, level);

  return {
    level,
    allowed,
    recommended_action: level,
    confidence,
    riskScore: score,
    reasoning,
    timestamp: Date.now(),
  };
}

/**
 * Batch decision helper
 * Useful for checking multiple addresses at once (Sentinel use case)
 */
export function decideOnScores(scores: Record<string, number>, threshold: number): Record<string, RiskDecision> {
  const results: Record<string, RiskDecision> = {};
  
  for (const [address, score] of Object.entries(scores)) {
    results[address] = decideOnRisk(score, threshold);
  }
  
  return results;
}

/**
 * Determine if decision should trigger onchain submission
 * 
 * Sentinel submits to registry when score exceeds threshold
 */
export function shouldSubmitToRegistry(decision: RiskDecision, threshold: number): boolean {
  // Submit if flagged as BLOCK and above threshold
  return decision.level === 'BLOCK' && decision.riskScore >= threshold;
}

/**
 * Log decision in structured format
 */
export function formatDecisionLog(address: string, decision: RiskDecision): Record<string, any> {
  return {
    timestamp: new Date(decision.timestamp).toISOString(),
    address,
    risk_score: decision.riskScore,
    decision_level: decision.level,
    allowed: decision.allowed,
    action: decision.recommended_action,
    confidence: decision.confidence,
    reason: decision.reasoning,
  };
}
