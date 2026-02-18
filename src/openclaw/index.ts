/**
 * OpenClaw Agent Manager
 * 
 * Factory and lifecycle management for all autonomous agents.
 * Handles initialization, coordination, and monitoring.
 */

import logger from '../utils/logger';
import RiskSentinel from './sentinel';
import RiskGuardian from './guardian';
import type { OpenClawAgent, AgentStatus, SentinelConfig, GuardianConfig } from './types';

class OpenClawManager {
  private agents: Map<string, OpenClawAgent> = new Map();
  private sentinel?: RiskSentinel;
  private guardian?: RiskGuardian;
  private initialized = false;

  /**
   * Initialize all configured agents
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('[OpenClaw] Already initialized');
      return;
    }

    try {
      // Parse configuration from environment
      const sentinelConfig: SentinelConfig = {
        enabled: process.env.SENTINEL_ENABLED === 'true',
        interval: parseInt(process.env.SENTINEL_INTERVAL || '120000', 10),
        threshold: parseInt(process.env.SENTINEL_THRESHOLD || '70', 10),
        maxAlerts: parseInt(process.env.SENTINEL_MAX_ALERTS || '100', 10),
        blockBatchSize: parseInt(process.env.SENTINEL_BATCH_SIZE || '10', 10),
      };

      const guardianConfig: GuardianConfig = {
        enabled: process.env.GUARDIAN_ENABLED === 'true',
        threshold: parseInt(process.env.GUARDIAN_THRESHOLD || '60', 10),
        strictMode: process.env.GUARDIAN_STRICT_MODE === 'true',
      };

      // Initialize Sentinel
      if (sentinelConfig.enabled) {
        this.sentinel = new RiskSentinel(sentinelConfig);
        this.agents.set('RiskSentinel', this.sentinel);
        logger.info('[OpenClaw] Sentinel configured', sentinelConfig);
      }

      // Initialize Guardian
      if (guardianConfig.enabled) {
        this.guardian = new RiskGuardian(guardianConfig);
        this.agents.set('RiskGuardian', this.guardian);
        logger.info('[OpenClaw] Guardian configured', guardianConfig);
      }

      this.initialized = true;
      logger.info('[OpenClaw] Manager initialized', {
        agents: this.agents.size,
        enabled: Array.from(this.agents.keys()),
      });
    } catch (error) {
      logger.error('[OpenClaw] Initialization failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Start all agents
   */
  async startAll(): Promise<void> {
    if (!this.initialized) {
      throw new Error('OpenClaw not initialized. Call initialize() first.');
    }

    const results = await Promise.allSettled(
      Array.from(this.agents.values()).map(agent => agent.start())
    );

    let failureCount = 0;
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const agentName = Array.from(this.agents.keys())[index];
        logger.error(`[OpenClaw] Failed to start ${agentName}`, {
          error: result.reason?.message || String(result.reason),
        });
        failureCount++;
      }
    });

    if (failureCount > 0) {
      logger.warn(`[OpenClaw] ${failureCount} agent(s) failed to start`);
    } else {
      logger.info('[OpenClaw] All agents started successfully');
    }
  }

  /**
   * Stop all agents
   */
  async stopAll(): Promise<void> {
    const results = await Promise.allSettled(
      Array.from(this.agents.values()).map(agent => agent.stop())
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const agentName = Array.from(this.agents.keys())[index];
        logger.warn(`[OpenClaw] Error stopping ${agentName}`, {
          error: result.reason?.message || String(result.reason),
        });
      }
    });

    logger.info('[OpenClaw] All agents stopped');
  }

  /**
   * Get Sentinel instance
   */
  getSentinel(): RiskSentinel | undefined {
    return this.sentinel;
  }

  /**
   * Get Guardian instance
   */
  getGuardian(): RiskGuardian | undefined {
    return this.guardian;
  }

  /**
   * Get status of all agents
   */
  getStatus(): Record<string, AgentStatus> {
    const status: Record<string, AgentStatus> = {};

    for (const [name, agent] of this.agents) {
      status[name] = agent.getStatus();
    }

    return status;
  }

  /**
   * Add address to Sentinel watchlist
   */
  addToSentinelWatch(address: string): void {
    if (this.sentinel) {
      this.sentinel.addWatchAddress(address);
    } else {
      logger.warn('[OpenClaw] Sentinel not enabled, cannot add to watchlist');
    }
  }
}

// Singleton instance
let managerInstance: OpenClawManager | null = null;

export function getOpenClawManager(): OpenClawManager {
  if (!managerInstance) {
    managerInstance = new OpenClawManager();
  }
  return managerInstance;
}

export type { OpenClawManager };
