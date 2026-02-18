/**
 * On-Chain Behavior Analyzer Module
 * Evidence-based analysis of on-chain activity patterns, holder concentration,
 * liquidity events, and transaction clustering
 */

import { ethers } from 'ethers';
import logger from '../../utils/logger';
import {
  getTransactionList,
  getContractCreation,
  getBscScanUrl,
} from '../../services/bscscanService';
import type { OnChainBehaviorAnalysis, EvidenceFlag, OnChainIndicator } from '../../types/risk';

const RPC_URL = process.env.BNB_RPC_URL || 'https://bsc-dataseed.binance.org/';

// PancakeSwap V2
const PANCAKE_FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';
const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) view returns (address)',
];
const PAIR_ABI = [
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function totalSupply() view returns (uint256)',
];
const ERC20_ABI = [
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(RPC_URL, { name: 'bnb', chainId: 56 });
}

/**
 * Comprehensive on-chain behavior analysis
 */
export async function analyzeOnChainBehavior(address: string): Promise<OnChainBehaviorAnalysis> {
  const provider = getProvider();
  const flags: EvidenceFlag[] = [];
  const indicators: OnChainIndicator[] = [];
  let score = 0;

  const metrics = {
    topHolderConcentration: null as number | null,
    contractAgeDays: null as number | null,
    holderCount: null as number | null,
    transactionCount: 0,
    balance: '0',
    liquidityBNB: null as string | null,
    hasDexPair: false,
    rugPullRisk: 0,
  };

  try {
    // Parallel basic data fetch
    const [balance, txCount, code] = await Promise.all([
      provider.getBalance(address).catch(() => BigInt(0)),
      provider.getTransactionCount(address).catch(() => 0),
      provider.getCode(address).catch(() => '0x'),
    ]);

    const isContract = code !== '0x' && code.length > 2;
    const balanceBNB = ethers.formatEther(balance);
    metrics.balance = balanceBNB;
    metrics.transactionCount = txCount;
    const bscscanLink = getBscScanUrl(address);

    // ─── Transaction Count Analysis ───
    if (txCount === 0) {
      indicators.push({ indicator: 'Transaction Count', evidence: '0 transactions', riskWeight: 30 });
      flags.push({
        id: 'zero_tx', name: 'Zero Transactions', severity: 'medium',
        description: 'Address has no transaction history.',
        evidence: 'RPC getTransactionCount returned 0.',
        category: 'onchain', source: 'RPC', bscscanLink, riskWeight: 15,
      });
      score += 15;
    } else if (txCount < 5) {
      indicators.push({ indicator: 'Transaction Count', evidence: `${txCount} transactions (very new)`, riskWeight: 20 });
      score += 12;
    } else if (txCount < 20) {
      indicators.push({ indicator: 'Transaction Count', evidence: `${txCount} transactions (limited history)`, riskWeight: 10 });
      score += 8;
    } else if (txCount < 50) {
      indicators.push({ indicator: 'Transaction Count', evidence: `${txCount} transactions (moderate)`, riskWeight: 5 });
      score += 3;
    } else {
      indicators.push({ indicator: 'Transaction Count', evidence: `${txCount} transactions (established)`, riskWeight: 0 });
    }

    // ─── Balance Analysis ───
    const balNum = parseFloat(balanceBNB);
    if (balNum === 0 && txCount > 10) {
      flags.push({
        id: 'zero_balance_active', name: 'Zero Balance Despite Activity', severity: 'high',
        description: 'Address has been active but currently holds 0 BNB. Funds may have been drained or moved.',
        evidence: `Balance: 0 BNB with ${txCount} transactions recorded.`,
        category: 'onchain', source: 'RPC', bscscanLink, riskWeight: 15,
      });
      indicators.push({ indicator: 'Balance', evidence: `0 BNB (${txCount} tx recorded - possible drainer)`, riskWeight: 20 });
      score += 15;
    } else {
      indicators.push({ indicator: 'Balance', evidence: `${parseFloat(balanceBNB).toFixed(4)} BNB`, riskWeight: 0 });
    }

    // ─── Contract Age (from BscScan transaction list) ───
    try {
      const txList = await getTransactionList(address, 1, 1);
      if (txList.length > 0) {
        // Sort to find earliest
        const sortedByTime = [...txList].sort((a, b) => parseInt(a.timeStamp) - parseInt(b.timeStamp));
        const firstTxTime = parseInt(sortedByTime[0].timeStamp);
        const ageDays = Math.floor((Date.now() / 1000 - firstTxTime) / 86400);
        metrics.contractAgeDays = ageDays;

        if (ageDays < 1) {
          indicators.push({ indicator: 'Contract Age', evidence: 'Less than 1 day old', riskWeight: 25 });
          flags.push({
            id: 'brand_new', name: 'Brand New Address', severity: 'high',
            description: 'This address was first active less than 24 hours ago.',
            evidence: `First transaction timestamp: ${new Date(firstTxTime * 1000).toISOString()}`,
            category: 'onchain', source: 'BscScan', bscscanLink, riskWeight: 15,
          });
          score += 15;
        } else if (ageDays < 7) {
          indicators.push({ indicator: 'Contract Age', evidence: `${ageDays} days old`, riskWeight: 15 });
          score += 10;
        } else if (ageDays < 30) {
          indicators.push({ indicator: 'Contract Age', evidence: `${ageDays} days old`, riskWeight: 8 });
          score += 5;
        } else {
          indicators.push({ indicator: 'Contract Age', evidence: `${ageDays} days old`, riskWeight: 0 });
        }
      }
    } catch {
      logger.warn(`Could not determine age for ${address}`);
    }

    // ─── Transaction Clustering & Large Transfers ───
    try {
      const recentTxs = await getTransactionList(address, 1, 50);
      if (recentTxs.length > 0) {
        // Check for large transfers to fresh wallets
        const largeTransfers = recentTxs.filter(tx => {
          const value = parseFloat(ethers.formatEther(tx.value || '0'));
          return value > 1 && tx.from.toLowerCase() === address.toLowerCase();
        });

        if (largeTransfers.length > 5) {
          flags.push({
            id: 'many_large_outflows', name: 'Multiple Large Outflows', severity: 'high',
            description: 'Multiple large BNB transfers detected from this address, suggesting fund distribution or draining.',
            evidence: `${largeTransfers.length} outgoing transactions over 1 BNB in recent history.`,
            category: 'onchain', source: 'BscScan', bscscanLink, riskWeight: 15,
          });
          indicators.push({ indicator: 'Large Outflows', evidence: `${largeTransfers.length} transfers > 1 BNB`, riskWeight: 15 });
          score += 12;
        }

        // Gas usage anomalies
        const gasUsages = recentTxs
          .map(tx => parseInt(tx.gasUsed || '0'))
          .filter(g => g > 0);
        if (gasUsages.length > 5) {
          const avgGas = gasUsages.reduce((a, b) => a + b, 0) / gasUsages.length;
          if (avgGas > 500000) {
            flags.push({
              id: 'high_gas_usage', name: 'High Gas Usage', severity: 'medium',
              description: 'Transactions from this address consume unusually high gas, suggesting complex or obfuscated logic.',
              evidence: `Average gas usage: ${Math.round(avgGas).toLocaleString()} per transaction.`,
              category: 'onchain', source: 'BscScan', bscscanLink, riskWeight: 8,
            });
            indicators.push({ indicator: 'Gas Usage', evidence: `Avg ${Math.round(avgGas).toLocaleString()} gas (high)`, riskWeight: 10 });
            score += 5;
          } else {
            indicators.push({ indicator: 'Gas Usage', evidence: `Avg ${Math.round(avgGas).toLocaleString()} gas (normal)`, riskWeight: 0 });
          }
        }

        // Transaction clustering (many txs in short timeframe)
        if (recentTxs.length >= 10) {
          const timestamps = recentTxs.map(tx => parseInt(tx.timeStamp));
          const timeRange = Math.max(...timestamps) - Math.min(...timestamps);
          const txPerHour = recentTxs.length / (timeRange / 3600 || 1);

          if (txPerHour > 10) {
            flags.push({
              id: 'tx_clustering', name: 'Transaction Clustering', severity: 'medium',
              description: 'High frequency of transactions in a short timeframe, suggesting automated or bot-like behavior.',
              evidence: `${txPerHour.toFixed(1)} transactions per hour detected.`,
              category: 'onchain', source: 'BscScan', bscscanLink, riskWeight: 10,
            });
            indicators.push({ indicator: 'Transaction Clustering', evidence: `${txPerHour.toFixed(1)} tx/hour`, riskWeight: 10 });
            score += 8;
          }
        }
      }
    } catch {
      logger.warn(`Could not analyze transactions for ${address}`);
    }

    // ─── Deployer History (for contracts) ───
    if (isContract) {
      try {
        const creation = await getContractCreation([address]);
        if (creation.length > 0) {
          const deployer = creation[0].contractCreator;
          indicators.push({
            indicator: 'Deployer',
            evidence: `${deployer.slice(0, 10)}...${deployer.slice(-6)}`,
            riskWeight: 0,
          });

          // Check deployer's history
          const deployerTxCount = await provider.getTransactionCount(deployer).catch(() => 0);
          if (deployerTxCount > 50) {
            // Deployer has created many contracts - potential serial deployer
            flags.push({
              id: 'serial_deployer', name: 'Serial Contract Deployer', severity: 'medium',
              description: 'The deployer wallet has a high transaction count, suggesting it may be a serial contract deployer (common in scam patterns).',
              evidence: `Deployer ${deployer.slice(0, 10)}... has ${deployerTxCount} transactions.`,
              category: 'onchain', source: 'RPC', bscscanLink: getBscScanUrl(deployer), riskWeight: 10,
            });
            indicators.push({ indicator: 'Deployer History', evidence: `${deployerTxCount} tx (serial deployer risk)`, riskWeight: 12 });
            score += 8;
          } else {
            indicators.push({ indicator: 'Deployer History', evidence: `${deployerTxCount} transactions`, riskWeight: 0 });
          }
        }
      } catch {
        logger.warn(`Could not check deployer for ${address}`);
      }
    }

    // ─── Liquidity & DEX Analysis (for tokens) ───
    if (isContract) {
      try {
        const factory = new ethers.Contract(PANCAKE_FACTORY, FACTORY_ABI, provider);
        const pairAddress = await factory.getPair(address, WBNB_ADDRESS);

        if (pairAddress !== ethers.ZeroAddress) {
          metrics.hasDexPair = true;
          const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
          const [reserves, token0] = await Promise.all([
            pair.getReserves(),
            pair.token0(),
          ]);

          const isToken0BNB = token0.toLowerCase() === WBNB_ADDRESS.toLowerCase();
          const bnbReserve = isToken0BNB ? reserves[0] : reserves[1];
          const liquidityBNB = parseFloat(ethers.formatEther(bnbReserve));
          metrics.liquidityBNB = liquidityBNB.toFixed(4);

          if (liquidityBNB < 1) {
            flags.push({
              id: 'low_liquidity', name: 'Very Low Liquidity', severity: 'high',
              description: 'Less than 1 BNB in the PancakeSwap liquidity pool. Extremely high slippage and rug pull risk.',
              evidence: `PancakeSwap V2 pair has ${liquidityBNB.toFixed(4)} BNB in reserves.`,
              category: 'onchain', source: 'PancakeSwap', bscscanLink: getBscScanUrl(pairAddress), riskWeight: 20,
            });
            indicators.push({ indicator: 'Liquidity (BNB)', evidence: `${liquidityBNB.toFixed(4)} BNB (critical)`, riskWeight: 25 });
            score += 18;
            metrics.rugPullRisk += 30;
          } else if (liquidityBNB < 10) {
            indicators.push({ indicator: 'Liquidity (BNB)', evidence: `${liquidityBNB.toFixed(2)} BNB (low)`, riskWeight: 15 });
            score += 10;
            metrics.rugPullRisk += 15;
          } else if (liquidityBNB < 50) {
            indicators.push({ indicator: 'Liquidity (BNB)', evidence: `${liquidityBNB.toFixed(2)} BNB (moderate)`, riskWeight: 5 });
            score += 3;
            metrics.rugPullRisk += 5;
          } else {
            indicators.push({ indicator: 'Liquidity (BNB)', evidence: `${liquidityBNB.toFixed(2)} BNB (healthy)`, riskWeight: 0 });
          }

          // Liquidity ratio check
          const tokenReserve = isToken0BNB ? reserves[1] : reserves[0];
          const bnbVal = parseFloat(ethers.formatEther(bnbReserve));
          let tokenDecimals = 18;
          try {
            const tokenContract = new ethers.Contract(address, ERC20_ABI, provider);
            tokenDecimals = await tokenContract.decimals().catch(() => 18);
          } catch {}
          const tokenVal = parseFloat(ethers.formatUnits(tokenReserve, tokenDecimals));
          const totalVal = bnbVal + tokenVal;

          if (totalVal > 0) {
            const ratio = bnbVal / totalVal;
            if (ratio < 0.2 || ratio > 0.8) {
              flags.push({
                id: 'imbalanced_pool', name: 'Severely Imbalanced Pool', severity: 'high',
                description: 'Liquidity pool reserves are severely imbalanced, indicating possible manipulation or imminent rug pull.',
                evidence: `BNB ratio in pool: ${(ratio * 100).toFixed(1)}% (expected ~50%).`,
                category: 'onchain', source: 'PancakeSwap', riskWeight: 15,
              });
              indicators.push({ indicator: 'Pool Balance', evidence: `${(ratio * 100).toFixed(1)}% BNB ratio (severely imbalanced)`, riskWeight: 18 });
              score += 12;
              metrics.rugPullRisk += 20;
            } else if (ratio < 0.35 || ratio > 0.65) {
              indicators.push({ indicator: 'Pool Balance', evidence: `${(ratio * 100).toFixed(1)}% BNB ratio (imbalanced)`, riskWeight: 8 });
              score += 5;
              metrics.rugPullRisk += 10;
            } else {
              indicators.push({ indicator: 'Pool Balance', evidence: `${(ratio * 100).toFixed(1)}% BNB ratio (balanced)`, riskWeight: 0 });
            }
          }
        } else {
          flags.push({
            id: 'no_dex_pair', name: 'No DEX Trading Pair', severity: 'medium',
            description: 'No PancakeSwap V2 trading pair found for this token. Cannot be traded on the primary BSC DEX.',
            evidence: 'PancakeSwap V2 Factory getPair returned zero address.',
            category: 'onchain', source: 'PancakeSwap', riskWeight: 12,
          });
          indicators.push({ indicator: 'DEX Pair', evidence: 'Not found on PancakeSwap', riskWeight: 15 });
          score += 10;
          metrics.rugPullRisk += 20;
        }
      } catch {
        logger.warn(`Could not check DEX data for ${address}`);
      }
    }

    // ─── Suspicious Activity Patterns ───
    if (txCount > 100 && balNum === 0) {
      flags.push({
        id: 'fund_drainer', name: 'Possible Fund Drainer', severity: 'critical',
        description: 'High transaction count with zero balance is a strong indicator of fund draining activity.',
        evidence: `${txCount} transactions with 0 BNB balance remaining.`,
        category: 'onchain', source: 'RPC', bscscanLink, riskWeight: 20,
      });
      score += 18;
    }

    if (txCount < 3 && balNum > 10) {
      flags.push({
        id: 'fresh_large_balance', name: 'Fresh Wallet with Large Balance', severity: 'medium',
        description: 'New wallet holding significant BNB. Verify the source of funds.',
        evidence: `Only ${txCount} transactions but holds ${balanceBNB} BNB.`,
        category: 'onchain', source: 'RPC', bscscanLink, riskWeight: 10,
      });
      score += 8;
    }

    metrics.rugPullRisk = Math.min(metrics.rugPullRisk, 100);

    logger.info(`On-chain behavior analysis for ${address}: score=${score}, flags=${flags.length}`);

    return {
      flags,
      indicators,
      score: Math.min(score, 100),
      metrics,
    };
  } catch (error) {
    logger.error(`On-chain behavior analysis failed for ${address}:`, { error });
    return {
      flags: [{
        id: 'analysis_error', name: 'Analysis Error', severity: 'medium',
        description: 'On-chain behavior analysis could not be completed.',
        evidence: 'RPC or API connection failed during analysis.',
        category: 'onchain', source: 'System', riskWeight: 10,
      }],
      indicators: [],
      score: 30,
      metrics,
    };
  }
}
