import express from 'express';
import { analyzeRiskIntelligence } from '../modules/aggregator/riskIntelligenceEngine';
import { isValidAddress, normalizeAddress } from '../utils/validation';
import { submitReport, getLatestReport, getReportCount } from '../services/registryService';
import logger from '../utils/logger';

const router = express.Router();

// In-memory cache (address -> { data, expiry })
const cache = new Map<string, { data: object; expiry: number }>();
const CACHE_TTL_MS = 120_000; // 2 minute cache (longer due to deeper analysis)

function getCached(key: string): object | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiry) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: object): void {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS });
  if (cache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now >= v.expiry) cache.delete(k);
    }
  }
}

/**
 * GET /api/risk/:address
 * Full risk intelligence analysis for a wallet/contract address on BNB Chain
 *
 * Returns evidence-based risk assessment with:
 * - Risk score (0-100) and level
 * - Category breakdown (contract, behavior, reputation)
 * - Evidence flags with severity, proof, and BscScan links
 * - On-chain indicators table
 * - Score calculation transparency
 * - Human-readable explanation
 */
router.get('/:address', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const rawAddress = req.params.address;

    if (!isValidAddress(rawAddress)) {
      logger.warn(`Invalid address format attempted: ${rawAddress}`);
      return res.status(400).json({
        success: false,
        error: 'Invalid address format',
        message: 'Address must be a valid BNB Chain address (0x followed by 40 hexadecimal characters)',
      });
    }

    const address = normalizeAddress(rawAddress);

    // Check cache
    const cached = getCached(address);
    if (cached) {
      logger.info(`Cache hit for address: ${address}`);
      return res.json(cached);
    }

    logger.info(`Starting risk intelligence analysis for: ${address}`);

    // Run full risk intelligence pipeline
    const intelligence = await analyzeRiskIntelligence(address);

    // Build backward-compatible + new evidence-based response
    const response = {
      success: true,

      // ─── Risk Summary ───
      address: intelligence.address,
      riskScore: intelligence.risk_score,
      riskLevel: intelligence.risk_level,
      addressType: intelligence.addressType,
      rugPullRisk: intelligence.analysis.onchain.metrics.rugPullRisk,

      // ─── Category Breakdown (new format) ───
      breakdown: intelligence.breakdown,

      // ─── Legacy component compatibility ───
      components: {
        transactionRisk: intelligence.analysis.onchain.score,
        contractRisk: intelligence.analysis.contract.score,
        liquidityRisk: Math.round(
          (intelligence.analysis.onchain.metrics.rugPullRisk +
            (intelligence.analysis.onchain.metrics.hasDexPair ? 0 : 25)) / 2
        ),
        behavioralRisk: intelligence.analysis.wallet.score,
      },

      // ─── Evidence Panels ───
      evidence: intelligence.evidence,

      // ─── Detailed Analysis ───
      analysis: {
        contract: {
          isContract: intelligence.analysis.contract.isContract,
          isVerified: intelligence.analysis.contract.isVerified,
          sourceCodeAvailable: intelligence.analysis.contract.sourceCodeAvailable,
          codeSize: intelligence.analysis.contract.codeSize,
          compilerVersion: intelligence.analysis.contract.compilerVersion,
          detections: intelligence.analysis.contract.detections,
          score: intelligence.analysis.contract.score,
        },
        onchain: {
          metrics: intelligence.analysis.onchain.metrics,
          score: intelligence.analysis.onchain.score,
        },
        wallet: {
          deployedContracts: intelligence.analysis.wallet.deployedContracts,
          linkedRugpulls: intelligence.analysis.wallet.linkedRugpulls,
          fundFlowSummary: intelligence.analysis.wallet.fundFlowSummary,
          transactionCount: intelligence.analysis.wallet.transactionCount,
          ageInDays: intelligence.analysis.wallet.ageInDays,
          balanceBNB: intelligence.analysis.wallet.balanceBNB,
          score: intelligence.analysis.wallet.score,
        },
        transparency: {
          github: intelligence.analysis.transparency.github,
          audit: intelligence.analysis.transparency.audit,
          teamDoxxed: intelligence.analysis.transparency.teamDoxxed,
          score: intelligence.analysis.transparency.score,
        },
        scamDatabase: {
          isBlacklisted: intelligence.analysis.scamDatabase.isBlacklisted,
          knownScam: intelligence.analysis.scamDatabase.knownScam,
          rugpullHistory: intelligence.analysis.scamDatabase.rugpullHistory,
          matchedDatabase: intelligence.analysis.scamDatabase.matchedDatabase,
          score: intelligence.analysis.scamDatabase.score,
        },
      },

      // ─── On-Chain Indicators Table ───
      onchainIndicators: intelligence.onchainIndicators,

      // ─── Score Calculation Transparency ───
      scoreCalculation: intelligence.scoreCalculation,

      // ─── Legacy flags (string array for backward compat) ───
      flags: [
        ...intelligence.evidence.contract_flags,
        ...intelligence.evidence.onchain_flags,
        ...intelligence.evidence.wallet_flags,
        ...intelligence.evidence.transparency_flags,
        ...intelligence.evidence.scam_flags,
      ]
        .filter(f => f.severity !== 'info')
        .map(f => `[${f.severity.toUpperCase()}] ${f.name}: ${f.description}`),

      // ─── Explanation ───
      explanation: intelligence.explanation,

      // ─── Meta ───
      timestamp: intelligence.timestamp,
      analysisTimeMs: intelligence.analysisTimeMs,

      // ─── On-Chain Registry (populated below) ───
      registry: null as any,
    };

    // Submit report on-chain (fire-and-forget, don't block the response)
    // Build the report data object that gets hashed for the on-chain proof
    const reportData = {
      address: intelligence.address,
      riskScore: intelligence.risk_score,
      riskLevel: intelligence.risk_level,
      breakdown: intelligence.breakdown,
      timestamp: intelligence.timestamp,
      schemaVersion: '2.0',
    };

    // Run on-chain submission + existing report query in parallel
    const [submitResult, existingReport, reportCount] = await Promise.all([
      submitReport(address, intelligence.risk_score, reportData),
      getLatestReport(address),
      getReportCount(address),
    ]);

    response.registry = {
      contractAddress: process.env.REGISTRY_CONTRACT_ADDRESS || '0x20B28a7b961a6d82222150905b0C01256607B5A3',
      onChainProof: submitResult.success
        ? {
            txHash: submitResult.txHash,
            blockNumber: submitResult.blockNumber,
            reportHash: submitResult.reportHash,
            gasUsed: submitResult.gasUsed,
          }
        : null,
      previousReport: existingReport,
      totalReportsForAddress: reportCount + (submitResult.success ? 1 : 0),
      submissionStatus: submitResult.success ? 'confirmed' : 'skipped',
      submissionError: submitResult.error || null,
    };

    // Cache the result
    setCache(address, response);

    logger.info(`Risk intelligence analysis completed for ${address} in ${intelligence.analysisTimeMs}ms: score=${intelligence.risk_score}, level=${intelligence.risk_level}`);

    res.json(response);
  } catch (error) {
    logger.error('Error during risk intelligence analysis:', { error });
    next(error);
  }
});

export default router;
