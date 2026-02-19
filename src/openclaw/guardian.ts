/**
 * Risk Guardian
 * 
 * Autonomous protection gate for user interactions.
 * 
 * Provides real-time risk assessment for user-initiated actions:
 * - User wants to interact with a contract
 * - Guardian evaluates risk
 * - Returns decision: ALLOW, WARN, or BLOCK
 * 
 * Implements OpenClaw's request-response protection pattern
 * 
 * Integration with Sentinel:
 * - If risk score >= 70 (high threshold), auto-triggers Sentinel monitoring
 * - Ensures high-risk addresses are tracked for continuous monitoring
 */

import logger from '../utils/logger';
import { analyzeRiskIntelligence } from '../modules/aggregator/riskIntelligenceEngine';
import { decideOnRisk, formatDecisionLog } from './decisionEngine';
import { getOpenClawManager } from './index';
import type { OpenClawAgent, AgentStatus, GuardianConfig, RiskDecision } from './types';

interface GuardianCheckRequest {
  targetAddress: string;
}

interface GuardianCheckResponse {
  allowed: boolean;
  level: string;
  recommended_action: string;
  riskScore: number;
  reasoning: string;
  confidence: string;
}

/**
 * RiskGuardian Class
 * 
 * Stateless protection agent that:
 * 1. Receives user interaction request
 * 2. Observes: analyzes target address risk
 * 3. Decides: compares against threshold
 * 4. Returns: structured protection decision
 * 
 * No onchain submission (unlike Sentinel)
 * Acts as an interactive gate, not an autonomous monitor
 */
class RiskGuardian implements OpenClawAgent {
  name = 'RiskGuardian';
  version = '1.0.0';
  enabled: boolean;

  private config: GuardianConfig;
  private running = true; // Always "ready" once initialized

  // Tracking metadata
  private checksTotal = 0;
  private errorsTotal = 0;
  private blockedCount = 0;
  private allowedCount = 0;
  private lastCheck?: number;

  constructor(config: GuardianConfig) {
    this.config = config;
    this.enabled = config.enabled;
  }

  /**
   * Initialization (no async work needed for Guardian)
   */
  async start(): Promise<void> {
    this.running = true;
    logger.info('[RiskGuardian] Protection gate initialized', {
      threshold: this.config.threshold,
      strictMode: this.config.strictMode,
    });
  }

  /**
   * Cleanup
   */
  async stop(): Promise<void> {
    this.running = false;
    logger.info('[RiskGuardian] Protection gate stopped', {
      totalChecks: this.checksTotal,
      blocked: this.blockedCount,
      allowed: this.allowedCount,
      errors: this.errorsTotal,
    });
  }

  /**
   * Main protection gate logic
   * 
   * OBSERVE → DECIDE → RESPOND
   *
   * @param request - User interaction request containing target address
   * @returns Protection decision
   */
  async checkAddress(request: GuardianCheckRequest): Promise<GuardianCheckResponse> {
    const checkStart = Date.now();
    this.checksTotal++;
    this.lastCheck = checkStart;

    try {
      const { targetAddress } = request;

      logger.info('[RiskGuardian] Checking address protection', { target: targetAddress });

      // ─── STEP 1: OBSERVE ───
      // Run full risk intelligence analysis
      const riskResult = await analyzeRiskIntelligence(targetAddress);
      const riskScore = riskResult.risk_score;

      // ─── STEP 2: DECIDE ───
      // Make autonomous protection decision
      const decision = decideOnRisk(riskScore, this.config.threshold);

      // ─── STEP 3: RESPOND ───
      // Format response for user
      const response = this.formatResponse(decision, riskScore);

      // Track results
      if (response.allowed) {
        this.allowedCount++;
      } else {
        this.blockedCount++;
      }

      // ─── AUTO-TRIGGER SENTINEL ───
      // If risk is high (>= 70), automatically add to Sentinel's watchlist
      // This ensures continuous monitoring of suspicious addresses
      if (riskScore >= 70) {
        try {
          const manager = getOpenClawManager();
          const sentinel = manager.getSentinel();
          if (sentinel && typeof sentinel.addWatchAddress === 'function') {
            sentinel.addWatchAddress(targetAddress);
            logger.info('[RiskGuardian] High-risk address auto-added to Sentinel watchlist', {
              target: targetAddress,
              score: riskScore,
            });
          }
        } catch (sentinelError) {
          logger.warn('[RiskGuardian] Failed to auto-add address to Sentinel', {
            target: targetAddress,
            error: sentinelError instanceof Error ? sentinelError.message : String(sentinelError),
          });
        }
      }

      const duration = Date.now() - checkStart;

      logger.info('[RiskGuardian] Protection check complete', {
        target: targetAddress,
        score: riskScore,
        decision: decision.recommended_action,
        duration: `${duration}ms`,
      });

      return response;
    } catch (error) {
      this.errorsTotal++;

      logger.error('[RiskGuardian] Protection check failed', {
        error: error instanceof Error ? error.message : String(error),
        target: request.targetAddress,
      });

      // Fail safely: if analysis fails, block the interaction
      return {
        allowed: false,
        level: 'BLOCK',
        recommended_action: 'BLOCK',
        riskScore: 100,
        reasoning: 'Could not complete risk analysis. Interaction blocked for safety.',
        confidence: 'high',
      };
    }
  }

  /**
   * Format decision into API response
   */
  private formatResponse(decision: RiskDecision, riskScore: number): GuardianCheckResponse {
    return {
      allowed: decision.allowed,
      level: decision.level,
      recommended_action: decision.recommended_action,
      riskScore: decision.riskScore,
      reasoning: decision.reasoning,
      confidence: decision.confidence,
    };
  }

  /**
   * Get agent status
   */
  getStatus(): AgentStatus {
    const successRate = this.checksTotal > 0 
      ? (((this.checksTotal - this.errorsTotal) / this.checksTotal) * 100)
      : 0;

    return {
      name: this.name,
      enabled: this.enabled,
      running: this.running,
      lastRun: this.lastCheck,
      runsTotal: this.checksTotal,
      errorsTotal: this.errorsTotal,
      successRate: parseFloat(successRate.toFixed(2)),
      alertsGenerated: this.blockedCount,
      submissionsToChain: 0, // Guardian doesn't submit to chain
    };
  }
}

export default RiskGuardian;
