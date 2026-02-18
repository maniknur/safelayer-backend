/**
 * Wallet History Checker Module
 * Analyzes wallet history: deployed contracts, linked rugpulls,
 * reused scam patterns, and fund flow tracing
 */

import { ethers } from 'ethers';
import logger from '../../utils/logger';
import {
  getTransactionList,
  getInternalTransactions,
  getContractCreation,
  getBscScanUrl,
} from '../../services/bscscanService';
import type { WalletHistoryAnalysis, EvidenceFlag } from '../../types/risk';

const RPC_URL = process.env.BNB_RPC_URL || 'https://bsc-dataseed.binance.org/';

function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(RPC_URL, { name: 'bnb', chainId: 56 });
}

/**
 * Analyze wallet history for scam patterns and fund flow
 */
export async function analyzeWalletHistory(address: string): Promise<WalletHistoryAnalysis> {
  const provider = getProvider();
  const flags: EvidenceFlag[] = [];
  let score = 0;
  const deployedContracts: string[] = [];
  const linkedRugpulls: string[] = [];
  let fundFlowSummary = '';

  try {
    const [balance, txCount, code] = await Promise.all([
      provider.getBalance(address).catch(() => BigInt(0)),
      provider.getTransactionCount(address).catch(() => 0),
      provider.getCode(address).catch(() => '0x'),
    ]);

    const isContract = code !== '0x' && code.length > 2;
    const balanceBNB = ethers.formatEther(balance);
    const bscscanLink = getBscScanUrl(address);

    // Estimate age from tx count (heuristic when no BscScan data)
    let ageInDays = Math.min(Math.floor(txCount / 2), 365);

    // ─── Get Transaction History ───
    let txList: any[] = [];
    try {
      txList = await getTransactionList(address, 1, 100);
      if (txList.length > 0) {
        const timestamps = txList.map(tx => parseInt(tx.timeStamp)).filter(t => t > 0);
        if (timestamps.length > 0) {
          const earliest = Math.min(...timestamps);
          ageInDays = Math.floor((Date.now() / 1000 - earliest) / 86400);
        }
      }
    } catch {
      logger.warn(`Could not fetch tx list for wallet history: ${address}`);
    }

    // ─── Detect Deployed Contracts ───
    // Contract creation txs have empty 'to' field
    const deployTxs = txList.filter(tx =>
      tx.from.toLowerCase() === address.toLowerCase() &&
      (tx.to === '' || tx.to === null) &&
      tx.contractAddress
    );

    for (const tx of deployTxs) {
      if (tx.contractAddress) {
        deployedContracts.push(tx.contractAddress);
      }
    }

    if (deployedContracts.length > 0) {
      if (deployedContracts.length > 10) {
        flags.push({
          id: 'mass_deployer', name: 'Mass Contract Deployer', severity: 'high',
          description: `This wallet has deployed ${deployedContracts.length} contracts. Mass deployment is a common pattern in rugpull and scam token operations.`,
          evidence: `${deployedContracts.length} contract creation transactions found. First 5: ${deployedContracts.slice(0, 5).map(c => c.slice(0, 10) + '...').join(', ')}`,
          category: 'wallet', source: 'BscScan', bscscanLink, riskWeight: 20,
        });
        score += 20;
      } else if (deployedContracts.length > 3) {
        flags.push({
          id: 'multi_deployer', name: 'Multiple Contract Deployments', severity: 'medium',
          description: `Wallet has deployed ${deployedContracts.length} contracts. Multiple deployments may indicate testing or serial token launches.`,
          evidence: `${deployedContracts.length} contract creation transactions detected.`,
          category: 'wallet', source: 'BscScan', bscscanLink, riskWeight: 10,
        });
        score += 10;
      } else {
        flags.push({
          id: 'contract_deployer', name: 'Contract Deployer', severity: 'info',
          description: `Wallet has deployed ${deployedContracts.length} contract(s).`,
          evidence: `${deployedContracts.length} contract creation transaction(s) found.`,
          category: 'wallet', source: 'BscScan', bscscanLink, riskWeight: 2,
        });
      }
    }

    // ─── Check Deployed Contracts for Rugpull Patterns ───
    // Check if any deployed contracts are now empty/inactive (potential rugpulls)
    for (const contractAddr of deployedContracts.slice(0, 5)) {
      try {
        const contractBalance = await provider.getBalance(contractAddr).catch(() => BigInt(0));
        const contractCode = await provider.getCode(contractAddr).catch(() => '0x');

        if (contractCode === '0x' || contractCode.length <= 2) {
          // Contract was self-destructed
          linkedRugpulls.push(contractAddr);
          flags.push({
            id: `destroyed_${contractAddr.slice(0, 8)}`,
            name: 'Linked Destroyed Contract',
            severity: 'critical',
            description: 'A contract previously deployed by this wallet has been self-destructed, a common rugpull exit strategy.',
            evidence: `Contract ${contractAddr.slice(0, 10)}...${contractAddr.slice(-6)} deployed by this wallet no longer has bytecode.`,
            category: 'wallet', source: 'RPC',
            bscscanLink: getBscScanUrl(contractAddr),
            riskWeight: 20,
          });
          score += 18;
        }
      } catch {
        // Skip individual contract check failures
      }
    }

    // ─── Fund Flow Analysis ───
    let totalInflow = 0;
    let totalOutflow = 0;
    const uniqueRecipients = new Set<string>();
    const uniqueSenders = new Set<string>();

    for (const tx of txList) {
      const value = parseFloat(ethers.formatEther(tx.value || '0'));
      if (tx.from.toLowerCase() === address.toLowerCase()) {
        totalOutflow += value;
        if (tx.to) uniqueRecipients.add(tx.to.toLowerCase());
      }
      if (tx.to && tx.to.toLowerCase() === address.toLowerCase()) {
        totalInflow += value;
        uniqueSenders.add(tx.from.toLowerCase());
      }
    }

    fundFlowSummary = `Inflow: ${totalInflow.toFixed(4)} BNB from ${uniqueSenders.size} sources | Outflow: ${totalOutflow.toFixed(4)} BNB to ${uniqueRecipients.size} recipients`;

    // Scam wallet pattern: receives from many, sends to few
    if (uniqueSenders.size > 10 && uniqueRecipients.size <= 2 && totalOutflow > totalInflow * 0.8) {
      flags.push({
        id: 'funnel_pattern', name: 'Fund Funneling Pattern', severity: 'critical',
        description: 'Wallet receives from many addresses but sends to very few. This is a classic scam collection wallet pattern.',
        evidence: `Received from ${uniqueSenders.size} addresses, sent to only ${uniqueRecipients.size}. Outflow ${totalOutflow.toFixed(2)} BNB ≈ ${((totalOutflow / (totalInflow || 1)) * 100).toFixed(0)}% of inflow.`,
        category: 'wallet', source: 'BscScan', bscscanLink, riskWeight: 20,
      });
      score += 20;
    }

    // Rapid fund movement: high volume in short time
    if (txList.length >= 20) {
      const timestamps = txList.map(tx => parseInt(tx.timeStamp)).filter(t => t > 0);
      if (timestamps.length >= 2) {
        const timeSpan = Math.max(...timestamps) - Math.min(...timestamps);
        const hoursSpan = timeSpan / 3600;
        if (hoursSpan > 0 && hoursSpan < 24 && totalOutflow > 5) {
          flags.push({
            id: 'rapid_movement', name: 'Rapid Fund Movement', severity: 'high',
            description: 'Large amounts of BNB moved within a short timeframe, suggesting urgency to transfer funds.',
            evidence: `${totalOutflow.toFixed(2)} BNB moved across ${txList.length} transactions in ${hoursSpan.toFixed(1)} hours.`,
            category: 'wallet', source: 'BscScan', bscscanLink, riskWeight: 15,
          });
          score += 12;
        }
      }
    }

    // ─── New Wallet with Inbound Only ───
    if (ageInDays < 7 && txCount < 5 && totalInflow > 0 && totalOutflow === 0) {
      flags.push({
        id: 'new_inbound_only', name: 'New Wallet (Inbound Only)', severity: 'low',
        description: 'Recently created wallet that has only received funds, no outgoing activity yet.',
        evidence: `${ageInDays} days old, ${txCount} tx, ${totalInflow.toFixed(4)} BNB received, 0 BNB sent.`,
        category: 'wallet', source: 'BscScan', bscscanLink, riskWeight: 5,
      });
      score += 5;
    }

    logger.info(`Wallet history analysis for ${address}: score=${score}, deployed=${deployedContracts.length}, rugpulls=${linkedRugpulls.length}`);

    return {
      flags,
      score: Math.min(score, 100),
      deployedContracts,
      linkedRugpulls,
      fundFlowSummary,
      isContract,
      transactionCount: txCount,
      ageInDays,
      balanceBNB,
    };
  } catch (error) {
    logger.error(`Wallet history analysis failed for ${address}:`, { error });
    return {
      flags: [{
        id: 'wallet_analysis_error', name: 'Wallet Analysis Error', severity: 'medium',
        description: 'Unable to complete wallet history analysis.',
        evidence: 'RPC or API connection failed during wallet history check.',
        category: 'wallet', source: 'System', riskWeight: 10,
      }],
      score: 20,
      deployedContracts: [],
      linkedRugpulls: [],
      fundFlowSummary: 'Analysis failed',
      isContract: false,
      transactionCount: 0,
      ageInDays: 0,
      balanceBNB: '0',
    };
  }
}
