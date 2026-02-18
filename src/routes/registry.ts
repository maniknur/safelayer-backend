/**
 * Registry API Routes
 * Endpoints for querying on-chain risk reports from the SafeLayerRegistry contract
 */

import express from 'express';
import { isValidAddress, normalizeAddress } from '../utils/validation';
import {
  getLatestReport,
  getReportCount,
  getReportsForTarget,
  getRegistryInfo,
} from '../services/registryService';
import logger from '../utils/logger';

const router = express.Router();

/**
 * GET /api/registry/info
 * Returns registry contract info (address, network, total reports, analyzer status)
 */
router.get('/info', async (_req, res, next) => {
  try {
    const info = await getRegistryInfo();
    res.json({ success: true, ...info });
  } catch (error) {
    logger.error('Error fetching registry info:', { error });
    next(error);
  }
});

/**
 * GET /api/registry/:address
 * Returns on-chain report data for a target address
 */
router.get('/:address', async (req, res, next) => {
  try {
    const rawAddress = req.params.address;

    if (!isValidAddress(rawAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address format',
      });
    }

    const address = normalizeAddress(rawAddress);

    const [latestReport, reportCount] = await Promise.all([
      getLatestReport(address),
      getReportCount(address),
    ]);

    res.json({
      success: true,
      address,
      reportCount,
      latestReport,
      hasOnChainReport: latestReport !== null,
    });
  } catch (error) {
    logger.error('Error fetching registry data:', { error });
    next(error);
  }
});

/**
 * GET /api/registry/:address/history
 * Returns all on-chain reports for a target address
 */
router.get('/:address/history', async (req, res, next) => {
  try {
    const rawAddress = req.params.address;

    if (!isValidAddress(rawAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address format',
      });
    }

    const address = normalizeAddress(rawAddress);
    const reports = await getReportsForTarget(address);

    res.json({
      success: true,
      address,
      reports,
      count: reports.length,
    });
  } catch (error) {
    logger.error('Error fetching registry history:', { error });
    next(error);
  }
});

export default router;
