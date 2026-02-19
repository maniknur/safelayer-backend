/**
 * Risk Sentinel
 * 
 * Autonomous monitoring agent that:
 * 1. Periodically monitors specified contracts
 * 2. Evaluates risk using the intelligence engine
 * 3. Makes autonomous decisions
 * 4. Submits high-risk findings to SafeLayerRegistry onchain
 * 
 * Implements OpenClaw's observe → decide → act pattern
 */

import logger from '../utils/logger';
import { analyzeRiskIntelligence } from '../modules/aggregator/riskIntelligenceEngine';
import { submitReport } from '../services/registryService';
import { decideOnRisk, shouldSubmitToRegistry, formatDecisionLog } from './decisionEngine';
import type { OpenClawAgent, AgentStatus, RiskAlert, SentinelConfig, AgentActionResult } from './types';

/**
 * RiskSentinel Class
 * 
 * Lifecycle:
 * - start() → begins periodic monitoring
 * - Each interval:
 *   - Observe: fetch risk analysis (via RiskIntelligenceEngine)
 *   - Decide: evaluate against threshold
 *   - Act: submit to registry if flagged + alert cache
 * - stop() → halts monitoring
 */
class RiskSentinel implements OpenClawAgent {
  name = 'RiskSentinel';
  version = '1.0.0';
  enabled: boolean;
  
  private config: SentinelConfig;
  private running = false;
  private intervalHandle: NodeJS.Timeout | null = null;
  private alerts: Map<string, RiskAlert> = new Map();
  
  // Tracking metadata
  private runsTotal = 0;
  private errorsTotal = 0;
  private successfulRuns = 0;
  private submissionsToChain = 0;
  private lastRun?: number;
  
  // Deduplication: track submitted alerts
  private submittedAlerts: Set<string> = new Set();

  constructor(config: SentinelConfig) {
    this.config = config;
    this.enabled = config.enabled;
  }

  /**
   * Start monitoring loop
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn('[RiskSentinel] Already running, skipping start');
      return;
    }

    this.running = true;
    logger.info('[RiskSentinel] Starting autonomous monitoring agent', {
      interval: this.config.interval,
      threshold: this.config.threshold,
      maxAlerts: this.config.maxAlerts,
    });

    // Run first check immediately
    await this.runMonitoringCycle();

    // Then schedule periodic checks
    this.intervalHandle = setInterval(
      () => this.runMonitoringCycle(),
      this.config.interval
    );
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    this.running = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    logger.info('[RiskSentinel] Autonomous monitoring stopped', {
      totalRuns: this.runsTotal,
      successfulRuns: this.successfulRuns,
      errors: this.errorsTotal,
      submissionsToChain: this.submissionsToChain,
    });
  }

  /**
   * Core monitoring cycle
   * 
   * OBSERVE → DECIDE → ACT
   */
  private async runMonitoringCycle(): Promise<void> {
    const cycleStart = Date.now();
    this.runsTotal++;
    this.lastRun = cycleStart;

    try {
      logger.info('[RiskSentinel] Starting monitoring cycle', {
        cycle: this.runsTotal,
        trackedAddresses: this.alerts.size,
      });

      // ─── STEP 1: OBSERVE (Data Collection) ───
      // In production, this could be:
      // - Query blocks for new deployments
      // - Monitor a watchlist
      // - Listen to events
      //
      // For MVP: we monitor addresses that previously triggered alerts
      // + any addresses added via addWatchAddress()
      
      if (this.alerts.size === 0) {
        logger.debug('[RiskSentinel] No addresses to monitor');
        return;
      }

      const addressesToCheck = Array.from(this.alerts.keys());
      logger.info(`[RiskSentinel] Monitoring ${addressesToCheck.length} addresses`);

      // ─── STEP 2: DECIDE (Risk Analysis) ───
      // Run risk evaluation on each address
      const decisions = await Promise.allSettled(
        addressesToCheck.map(async (address) => ({
          address,
          result: await analyzeRiskIntelligence(address),
        }))
      );

      let submittedCount = 0;

      for (let i = 0; i < decisions.length; i++) {
        const decision = decisions[i];
        const address = addressesToCheck[i];

        if (decision.status === 'rejected') {
          logger.warn(`[RiskSentinel] Analysis failed for ${address}`, {
            error: decision.reason?.message || 'Unknown error',
          });
          continue;
        }

        const riskResult = decision.value.result;
        const riskScore = riskResult.risk_score;

        // Make autonomous decision
        const decision_obj = decideOnRisk(riskScore, this.config.threshold);

        // ─── STEP 3: ACT (Submission) ───
        // If score exceeds threshold and should submit, hash and submit to registry
        if (shouldSubmitToRegistry(decision_obj, this.config.threshold)) {
          const dedupeKey = `${address}-${riskScore}`;
          
          if (!this.submittedAlerts.has(dedupeKey)) {
            const submitResult = await this.submitToRegistry(address, riskResult);

            if (submitResult.success && submitResult.txHash) {
              submittedCount++;
              this.submissionsToChain++;
              this.submittedAlerts.add(dedupeKey);

              // Update alert with submission info
              const alert = this.alerts.get(address);
              if (alert) {
                alert.submittedToChain = true;
                alert.txHash = submitResult.txHash;
                alert.reportHash = submitResult.reportHash;
              }

              logger.info('[RiskSentinel] Submitted to registry', {
                target: address,
                score: riskScore,
                txHash: submitResult.txHash,
              });
            }
          }
        }

        // Update or create alert entry
        this.updateAlert(address, riskScore, decision_obj.level, decision_obj.reasoning);
      }

      const duration = Date.now() - cycleStart;
      this.successfulRuns++;

      logger.info('[RiskSentinel] Monitoring cycle complete', {
        cycle: this.runsTotal,
        duration: `${duration}ms`,
        checked: addressesToCheck.length,
        submitted: submittedCount,
        alerts: this.alerts.size,
      });
    } catch (error) {
      this.errorsTotal++;
      logger.error('[RiskSentinel] Monitoring cycle error', {
        error: error instanceof Error ? error.message : String(error),
        cycle: this.runsTotal,
      });
    }
  }

  /**
   * Submit risk report to SafeLayerRegistry contract
   */
  private async submitToRegistry(
    address: string,
    riskResult: any
  ): Promise<{ success: boolean; txHash?: string; reportHash?: string; error?: string }> {
    try {
      // Create report data for hashing
      const reportData = {
        target: address,
        score: riskResult.risk_score,
        level: riskResult.risk_level,
        categories: riskResult.breakdown,
        timestamp: Date.now(),
      };

      // Submit to registry (submitReport will hash internally)
      const submitResult = await submitReport(
        address,
        Math.floor(riskResult.risk_score),
        reportData
      );

      return {
        success: submitResult.success,
        txHash: submitResult.txHash,
        reportHash: submitResult.reportHash,
        error: submitResult.error,
      };
    } catch (error) {
      logger.error('[RiskSentinel] Registry submission failed', {
        target: address,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Add address to monitoring watchlist
   */
  addWatchAddress(address: string): void {
    if (!this.alerts.has(address)) {
      this.alerts.set(address, {
        id: `${address}-${Date.now()}`,
        agent: 'RiskSentinel',
        target: address,
        riskScore: 0,
        level: 'ALLOW',
        reason: 'Initial observation',
        submittedToChain: false,
        timestamp: Date.now(),
      });

      logger.info('[RiskSentinel] Added address to watchlist', { address });
    }
  }

  /**
   * Remove address from monitoring watchlist
   */
  removeWatchAddress(address: string): boolean {
    const existed = this.alerts.has(address);
    if (existed) {
      this.alerts.delete(address);
      logger.info('[RiskSentinel] Removed address from watchlist', { address });
    }
    return existed;
  }

  /**
   * Get list of all watched addresses
   */
  getWatchlist(): string[] {
    return Array.from(this.alerts.keys());
  }

  /**
   * Update or create alert entry
   */
  private updateAlert(
    address: string,
    score: number,
    level: string,
    reason: string
  ): void {
    const now = Date.now();
    let alert = this.alerts.get(address);

    if (!alert) {
      alert = {
        id: `${address}-${now}`,
        agent: 'RiskSentinel',
        target: address,
        riskScore: score,
        level: level as any,
        reason,
        submittedToChain: false,
        timestamp: now,
      };
    } else {
      alert.riskScore = score;
      alert.level = level as any;
      alert.reason = reason;
      alert.timestamp = now;
    }

    this.alerts.set(address, alert);

    // Keep memory bounded
    if (this.alerts.size > this.config.maxAlerts) {
      const oldest = Array.from(this.alerts.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      )[0];

      if (oldest) {
        this.alerts.delete(oldest[0]);
      }
    }
  }

  /**
   * Get all alerts
   */
  getAlerts(): RiskAlert[] {
    return Array.from(this.alerts.values());
  }

  /**
   * Get agent status
   */
  getStatus(): AgentStatus {
    const successRate = this.runsTotal > 0 ? (this.successfulRuns / this.runsTotal) * 100 : 0;

    return {
      name: this.name,
      enabled: this.enabled,
      running: this.running,
      lastRun: this.lastRun,
      runsTotal: this.runsTotal,
      errorsTotal: this.errorsTotal,
      successRate: parseFloat(successRate.toFixed(2)),
      alertsGenerated: this.alerts.size,
      submissionsToChain: this.submissionsToChain,
    };
  }
}

export default RiskSentinel;
