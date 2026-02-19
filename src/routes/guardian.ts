/**
 * Guardian Routes
 * 
 * API endpoints for the RiskGuardian protection agent.
 * Handles user-triggered interaction protection checks.
 */

import express from 'express';
import { getOpenClawManager } from '../openclaw';
import { isValidAddress, normalizeAddress } from '../utils/validation';
import logger from '../utils/logger';

const router = express.Router();

/**
 * POST /api/guardian/check
 * 
 * Protection gate check for a target address.
 * 
 * Request:
 * {
 *   "targetAddress": "0x..."
 * }
 * 
 * Response:
 * {
 *   "allowed": boolean,
 *   "level": "ALLOW" | "WARN" | "BLOCK",
 *   "recommended_action": "ALLOW" | "WARN" | "BLOCK",
 *   "riskScore": number,
 *   "reasoning": string,
 *   "confidence": "low" | "medium" | "high"
 * }
 */
router.post('/check', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { targetAddress } = req.body;

    // Validate input
    if (!targetAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing targetAddress',
        message: 'Request must include targetAddress field',
      });
    }

    if (!isValidAddress(targetAddress)) {
      logger.warn('[Guardian] Invalid address format', { target: targetAddress });
      return res.status(400).json({
        success: false,
        error: 'Invalid address format',
        message: 'Address must be a valid BNB Chain address (0x followed by 40 hexadecimal characters)',
      });
    }

    const normalizedAddress = normalizeAddress(targetAddress);

    // Get Guardian instance
    const manager = getOpenClawManager();
    const guardian = manager.getGuardian();

    if (!guardian) {
      return res.status(503).json({
        success: false,
        error: 'Guardian not available',
        message: 'Risk Guardian protection agent is not enabled',
      });
    }

    // Run protection check
    const decision = await guardian.checkAddress({
      targetAddress: normalizedAddress,
    });

    // Auto-escalate to Sentinel monitoring if risk is elevated
    if (decision.level === 'WARN' || decision.level === 'BLOCK') {
      manager.addToSentinelWatch(normalizedAddress);
      logger.info('[Guardian] High-risk address escalated to Sentinel watchlist', {
        address: normalizedAddress,
        level: decision.level,
        riskScore: decision.riskScore,
      });
    }

    // Return decision
    return res.json({
      success: true,
      data: decision,
    });
  } catch (error) {
    logger.error('[Guardian] Route error', {
      error: error instanceof Error ? error.message : String(error),
      path: req.path,
    });

    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to process protection check',
    });
  }
});

/**
 * GET /api/guardian/status
 * 
 * Get Guardian agent status and statistics.
 */
router.get('/status', (req: express.Request, res: express.Response) => {
  try {
    const manager = getOpenClawManager();
    const guardian = manager.getGuardian();

    if (!guardian) {
      return res.status(503).json({
        success: false,
        error: 'Guardian not available',
      });
    }

    const status = guardian.getStatus();

    return res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('[Guardian] Status error', {
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      success: false,
      error: 'Could not retrieve status',
    });
  }
});

export default router;
