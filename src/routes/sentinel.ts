/**
 * Risk Sentinel Routes
 * 
 * Endpoints for managing the autonomous Sentinel agent:
 * - Add addresses to monitoring watchlist
 * - View watchlist
 * - Remove addresses
 * - Check Sentinel status
 */

import express from 'express';
import logger from '../utils/logger';
import { getOpenClawManager } from '../openclaw';
import { isValidAddress } from '../utils/validation';

const router = express.Router();

/**
 * POST /api/sentinel/watch
 * Add address to Sentinel's monitoring watchlist
 * 
 * Request: { targetAddress: "0x..." }
 * Response: { success: boolean, message: string, address?: string }
 */
router.post('/watch', (req, res) => {
  try {
    const { targetAddress } = req.body;

    // Validate input
    if (!targetAddress) {
      return res.status(400).json({
        success: false,
        message: 'targetAddress is required',
      });
    }

    if (!isValidAddress(targetAddress)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Ethereum address format',
      });
    }

    // Add to Sentinel watchlist
    const manager = getOpenClawManager();
    const sentinel = manager.getSentinel();

    if (!sentinel) {
      return res.status(500).json({
        success: false,
        message: 'RiskSentinel agent not available',
      });
    }

    // Add watch (sentinel.addWatchAddress exists in implementation)
    if (typeof sentinel.addWatchAddress === 'function') {
      sentinel.addWatchAddress(targetAddress);

      logger.info('[SentinelAPI] Address added to watchlist', {
        address: targetAddress,
      });

      return res.status(200).json({
        success: true,
        message: `Address ${targetAddress.slice(0, 6)}... added to monitoring watchlist`,
        address: targetAddress,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Sentinel watchlist method not available',
      });
    }
  } catch (error) {
    logger.error('[SentinelAPI] Error adding address to watchlist', {
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to add address to watchlist',
    });
  }
});

/**
 * GET /api/sentinel/watchlist
 * View all addresses being monitored by Sentinel
 * 
 * Response: { success: boolean, watchlist: string[], count: number }
 */
router.get('/watchlist', (req, res) => {
  try {
    const manager = getOpenClawManager();
    const sentinel = manager.getSentinel();

    if (!sentinel) {
      return res.status(500).json({
        success: false,
        message: 'RiskSentinel agent not available',
      });
    }

    // Get watchlist (getWatchlist exists in implementation)
    if (typeof sentinel.getWatchlist === 'function') {
      const watchlist = sentinel.getWatchlist();

      return res.status(200).json({
        success: true,
        watchlist,
        count: watchlist.length,
        monitoring: watchlist.length > 0,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Sentinel watchlist method not available',
      });
    }
  } catch (error) {
    logger.error('[SentinelAPI] Error getting watchlist', {
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to get watchlist',
    });
  }
});

/**
 * DELETE /api/sentinel/watch/:address
 * Remove address from Sentinel's monitoring watchlist
 * 
 * Response: { success: boolean, message: string, address?: string }
 */
router.delete('/watch/:address', (req, res) => {
  try {
    const { address } = req.params;

    // Validate input
    if (!address) {
      return res.status(400).json({
        success: false,
        message: 'address parameter is required',
      });
    }

    if (!isValidAddress(address)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Ethereum address format',
      });
    }

    // Remove from watchlist
    const manager = getOpenClawManager();
    const sentinel = manager.getSentinel();

    if (!sentinel) {
      return res.status(500).json({
        success: false,
        message: 'RiskSentinel agent not available',
      });
    }

    // Remove watch (removeWatchAddress exists in implementation)
    if (typeof sentinel.removeWatchAddress === 'function') {
      const wasRemoved = sentinel.removeWatchAddress(address);

      if (wasRemoved) {
        logger.info('[SentinelAPI] Address removed from watchlist', {
          address,
        });

        return res.status(200).json({
          success: true,
          message: `Address ${address.slice(0, 6)}... removed from monitoring watchlist`,
          address,
        });
      } else {
        return res.status(404).json({
          success: false,
          message: `Address ${address.slice(0, 6)}... not found in watchlist`,
        });
      }
    } else {
      return res.status(500).json({
        success: false,
        message: 'Sentinel watchlist method not available',
      });
    }
  } catch (error) {
    logger.error('[SentinelAPI] Error removing address from watchlist', {
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to remove address from watchlist',
    });
  }
});

/**
 * GET /api/sentinel/status
 * Get detailed Sentinel agent status
 * 
 * Response: { success: boolean, agent: AgentStatus }
 */
router.get('/status', (req, res) => {
  try {
    const manager = getOpenClawManager();
    const sentinel = manager.getSentinel();

    if (!sentinel) {
      return res.status(500).json({
        success: false,
        message: 'RiskSentinel agent not available',
      });
    }

    // Get full status
    if (typeof sentinel.getStatus === 'function') {
      const status = sentinel.getStatus();

      return res.status(200).json({
        success: true,
        agent: status,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Sentinel status method not available',
      });
    }
  } catch (error) {
    logger.error('[SentinelAPI] Error getting sentinel status', {
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to get sentinel status',
    });
  }
});

export default router;
