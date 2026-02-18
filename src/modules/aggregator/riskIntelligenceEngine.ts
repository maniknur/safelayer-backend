/**
 * Risk Intelligence Engine
 * Aggregates all analysis modules into a comprehensive, evidence-based risk assessment
 * with transparent scoring and proof references
 */

import logger from '../../utils/logger';
import { analyzeContract } from '../scanner/contractAnalyzer';
import { analyzeOnChainBehavior } from '../onchain/behaviorAnalyzer';
import { analyzeWalletHistory } from '../wallet/walletHistoryChecker';
import { analyzeTransparency } from '../transparency/transparencyChecker';
import { checkScamDatabase } from '../scam/scamDatabaseChecker';
import { getContractSourceCode, getContractCreation } from '../../services/bscscanService';
import type {
  RiskIntelligenceResult,
  RiskLevel,
  RiskBreakdown,
  ScoreCalculation,
  AddressType,
} from '../../types/risk';

// ─── Scoring Weights ───
const WEIGHTS = {
  contract_risk: 0.40,
  behavior_risk: 0.40,
  reputation_risk: 0.20,
};

export function getRiskLevel(score: number): RiskLevel {
  if (score < 20) return 'Very Low';
  if (score < 40) return 'Low';
  if (score < 60) return 'Medium';
  if (score < 80) return 'High';
  return 'Very High';
}

/**
 * Run the full risk intelligence analysis pipeline
 */
export async function analyzeRiskIntelligence(address: string): Promise<RiskIntelligenceResult> {
  const startTime = Date.now();
  logger.info(`[RiskEngine] Starting intelligence analysis for ${address}`);

  // ─── Phase 1: Parallel Data Collection ───
  const [contractResult, onchainResult, walletResult] = await Promise.all([
    analyzeContract(address),
    analyzeOnChainBehavior(address),
    analyzeWalletHistory(address),
  ]);

  // ─── Phase 2: Context-Dependent Analysis ───
  // Get token symbol and contract name for transparency search
  let tokenSymbol: string | undefined;
  let contractName: string | undefined;
  let deployerAddress: string | undefined;

  if (contractResult.isContract) {
    try {
      const sourceData = await getContractSourceCode(address);
      if (sourceData) {
        contractName = sourceData.ContractName || undefined;
      }
    } catch { /* skip */ }

    try {
      const creation = await getContractCreation([address]);
      if (creation.length > 0) {
        deployerAddress = creation[0].contractCreator;
      }
    } catch { /* skip */ }
  }

  // Use onchain metrics for token symbol detection
  if (onchainResult.metrics.hasDexPair) {
    tokenSymbol = 'TOKEN'; // Placeholder - already detected in onchain module
  }

  // Phase 2 modules (can use results from phase 1)
  const [transparencyResult, scamResult] = await Promise.all([
    analyzeTransparency(address, tokenSymbol, contractName),
    checkScamDatabase(address, deployerAddress, walletResult.deployedContracts),
  ]);

  // ─── Phase 3: Score Calculation ───
  // Contract Risk = contract analysis score
  const contractRiskRaw = contractResult.score;

  // Behavior Risk = weighted combination of onchain + wallet
  const behaviorRiskRaw = Math.min(
    Math.round(onchainResult.score * 0.6 + walletResult.score * 0.4),
    100
  );

  // Reputation Risk = weighted combination of transparency + scam
  const reputationRiskRaw = Math.min(
    Math.round(transparencyResult.score * 0.5 + scamResult.score * 0.5),
    100
  );

  // Weighted overall score
  let finalScore = Math.round(
    contractRiskRaw * WEIGHTS.contract_risk +
    behaviorRiskRaw * WEIGHTS.behavior_risk +
    reputationRiskRaw * WEIGHTS.reputation_risk
  );

  const adjustments: string[] = [];

  // ─── Floor Rules ───
  const allFlags = [
    ...contractResult.flags,
    ...onchainResult.flags,
    ...walletResult.flags,
    ...transparencyResult.flags,
    ...scamResult.flags,
  ];
  const criticalFlags = allFlags.filter(f => f.severity === 'critical');
  const highFlags = allFlags.filter(f => f.severity === 'high');

  // Critical flags guarantee high risk
  if (criticalFlags.length > 0) {
    const minScore = Math.max(70, finalScore);
    if (minScore > finalScore) {
      adjustments.push(`Critical flag floor: ${finalScore} → ${minScore} (${criticalFlags.length} critical flag(s))`);
      finalScore = minScore;
    }
  }

  // Multiple high-severity flags boost score
  if (highFlags.length >= 3) {
    const minScore = Math.max(60, finalScore);
    if (minScore > finalScore) {
      adjustments.push(`High flag floor: ${finalScore} → ${minScore} (${highFlags.length} high-severity flags)`);
      finalScore = minScore;
    }
  }

  // Component floor rules
  const maxComponent = Math.max(contractRiskRaw, behaviorRiskRaw, reputationRiskRaw);
  if (maxComponent >= 75) {
    const minScore = Math.max(60, finalScore);
    if (minScore > finalScore) {
      adjustments.push(`Component floor: ${finalScore} → ${minScore} (max component score: ${maxComponent})`);
      finalScore = minScore;
    }
  }

  // Scam database match forces high risk
  if (scamResult.knownScam || scamResult.isBlacklisted) {
    const minScore = Math.max(85, finalScore);
    if (minScore > finalScore) {
      adjustments.push(`Scam DB floor: ${finalScore} → ${minScore} (address flagged in scam database)`);
      finalScore = minScore;
    }
  }

  // Linked rugpull forces high risk
  if (scamResult.rugpullHistory || walletResult.linkedRugpulls.length > 0) {
    const minScore = Math.max(80, finalScore);
    if (minScore > finalScore) {
      adjustments.push(`Rugpull link floor: ${finalScore} → ${minScore} (linked to known rugpull)`);
      finalScore = minScore;
    }
  }

  // Total flag count boost
  const significantFlags = allFlags.filter(f => f.severity !== 'info');
  if (significantFlags.length >= 7) {
    const minScore = Math.max(65, finalScore);
    if (minScore > finalScore) {
      adjustments.push(`Flag count floor: ${finalScore} → ${minScore} (${significantFlags.length} significant flags)`);
      finalScore = minScore;
    }
  }

  finalScore = Math.min(finalScore, 100);

  // ─── Determine Address Type ───
  let addressType: AddressType = 'wallet';
  if (contractResult.isContract) {
    addressType = onchainResult.metrics.hasDexPair ? 'token' : 'contract';
  }

  // ─── Build Score Calculation Transparency ───
  const scoreCalculation: ScoreCalculation = {
    formula: 'Risk Score = (Contract Risk × 0.40) + (On-chain Behavior Risk × 0.40) + (Reputation Risk × 0.20)',
    weights: WEIGHTS,
    rawScores: {
      contract_risk: contractRiskRaw,
      behavior_risk: behaviorRiskRaw,
      reputation_risk: reputationRiskRaw,
    },
    adjustments: adjustments.length > 0 ? adjustments : ['No adjustments applied - raw weighted score used.'],
    finalScore,
  };

  // ─── Build Breakdown ───
  const breakdown: RiskBreakdown = {
    contract_risk: contractRiskRaw,
    behavior_risk: behaviorRiskRaw,
    reputation_risk: reputationRiskRaw,
  };

  // ─── Generate Explanation ───
  const explanation = generateExplanation(
    finalScore,
    addressType,
    contractResult,
    onchainResult,
    walletResult,
    transparencyResult,
    scamResult
  );

  const result: RiskIntelligenceResult = {
    risk_score: finalScore,
    risk_level: getRiskLevel(finalScore),
    address,
    addressType,
    breakdown,
    evidence: {
      contract_flags: contractResult.flags,
      onchain_flags: onchainResult.flags,
      wallet_flags: walletResult.flags,
      transparency_flags: transparencyResult.flags,
      scam_flags: scamResult.flags,
    },
    analysis: {
      contract: contractResult,
      onchain: onchainResult,
      wallet: walletResult,
      transparency: transparencyResult,
      scamDatabase: scamResult,
    },
    scoreCalculation,
    onchainIndicators: onchainResult.indicators,
    explanation,
    timestamp: new Date().toISOString(),
    analysisTimeMs: Date.now() - startTime,
  };

  logger.info(`[RiskEngine] Analysis complete for ${address}: score=${finalScore}, level=${result.risk_level}, flags=${allFlags.length}, time=${result.analysisTimeMs}ms`);

  return result;
}

/**
 * Generate human-readable explanation from analysis results
 */
function generateExplanation(
  score: number,
  addressType: AddressType,
  contract: any,
  onchain: any,
  wallet: any,
  transparency: any,
  scam: any
): { summary: string; keyFindings: string[]; recommendations: string[]; riskFactors: string[] } {
  const level = getRiskLevel(score);
  const typeLabel = addressType === 'token' ? 'token contract' : addressType === 'contract' ? 'smart contract' : 'wallet';

  // Summary
  let summary = '';
  if (score < 20) {
    summary = `This ${typeLabel} shows a very low risk profile (${score}%). No significant security concerns detected.`;
  } else if (score < 40) {
    summary = `This ${typeLabel} has a low risk score (${score}%) with minor concerns. Generally safe but verify before large transactions.`;
  } else if (score < 60) {
    summary = `This ${typeLabel} has a moderate risk score (${score}%). Several risk factors were identified that warrant caution.`;
  } else if (score < 80) {
    summary = `This ${typeLabel} shows HIGH RISK (${score}%). Multiple significant risk factors detected. Exercise extreme caution.`;
  } else {
    summary = `This ${typeLabel} is flagged as VERY HIGH RISK (${score}%). Critical security concerns identified. Interaction is strongly discouraged.`;
  }

  // Key findings
  const keyFindings: string[] = [];
  const allFlags = [
    ...contract.flags, ...onchain.flags, ...wallet.flags,
    ...transparency.flags, ...scam.flags,
  ];

  // Sort by severity weight and pick top findings
  const sortedFlags = allFlags
    .filter((f: any) => f.severity !== 'info')
    .sort((a: any, b: any) => b.riskWeight - a.riskWeight)
    .slice(0, 5);

  for (const flag of sortedFlags) {
    keyFindings.push(`[${flag.severity.toUpperCase()}] ${flag.name}: ${flag.description}`);
  }

  if (keyFindings.length === 0) {
    keyFindings.push('No significant risk factors detected in the analysis.');
  }

  // Recommendations
  const recommendations: string[] = [];
  if (score >= 80) {
    recommendations.push('AVOID interacting with this address. High probability of scam or rugpull.');
    recommendations.push('If you have funds at risk, consider withdrawing immediately.');
    recommendations.push('Report this address to BNB Chain community scam databases.');
  } else if (score >= 60) {
    recommendations.push('Exercise extreme caution before any interaction.');
    recommendations.push('Verify the project through multiple independent sources.');
    recommendations.push('Start with a very small test transaction if you must interact.');
    recommendations.push('Check if the contract source code is verified on BscScan.');
  } else if (score >= 40) {
    recommendations.push('Proceed with caution and do additional research.');
    recommendations.push('Verify the project team and their track record.');
    recommendations.push('Check community sentiment on BSC forums and social media.');
  } else {
    recommendations.push('Standard precautions apply. Always verify before large transactions.');
    recommendations.push('Keep monitoring the address for changes in behavior.');
  }

  // Risk factors
  const riskFactors: string[] = [];
  if (contract.score > 0) riskFactors.push(`Contract Risk: ${contract.score}/100`);
  if (onchain.score > 0) riskFactors.push(`On-chain Behavior Risk: ${onchain.score}/100`);
  if (wallet.score > 0) riskFactors.push(`Wallet History Risk: ${wallet.score}/100`);
  if (transparency.score > 0) riskFactors.push(`Transparency Risk: ${transparency.score}/100`);
  if (scam.score > 0) riskFactors.push(`Scam Database Risk: ${scam.score}/100`);

  return { summary, keyFindings, recommendations, riskFactors };
}
