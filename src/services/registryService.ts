/**
 * SafeLayer Registry Service
 * Centralized module for interacting with the SafeLayerRegistry smart contract
 * on BNB Chain. Handles report hashing, submission, and querying.
 */

import { ethers } from 'ethers';
import logger from '../utils/logger';

// ─── Contract Configuration ───
const REGISTRY_ADDRESS = process.env.REGISTRY_CONTRACT_ADDRESS || '0x20B28a7b961a6d82222150905b0C01256607B5A3';
const RPC_URL = process.env.BNB_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/';
const ANALYZER_PRIVATE_KEY = process.env.ANALYZER_PRIVATE_KEY || '';

// ─── Contract ABI (minimal — only the functions we use) ───
const REGISTRY_ABI = [
  // Write functions
  'function submitRiskReport(address targetAddress, uint8 riskScore, uint8 riskLevel, bytes32 reportHash) external',
  'function submitBatchReports(address[] calldata targetAddresses, uint8[] calldata riskScores, uint8[] calldata riskLevels, bytes32[] calldata reportHashes) external',
  // Read functions
  'function getReport(uint256 reportIndex) external view returns (tuple(address targetAddress, uint8 riskScore, uint8 riskLevel, bytes32 reportHash, uint256 timestamp, address analyzer))',
  'function getLatestReportForTarget(address targetAddress) external view returns (tuple(address targetAddress, uint8 riskScore, uint8 riskLevel, bytes32 reportHash, uint256 timestamp, address analyzer))',
  'function getReportsByTarget(address targetAddress) external view returns (uint256[])',
  'function getTotalReports() external view returns (uint256)',
  'function getReportCountForTarget(address targetAddress) external view returns (uint256)',
  'function approvedAnalyzers(address) external view returns (bool)',
  // Events
  'event RiskReportSubmitted(address indexed targetAddress, uint8 riskScore, uint8 riskLevel, bytes32 indexed reportHash, address indexed analyzer, uint256 timestamp)',
] as const;

// ─── Risk Level Enum (matches Solidity) ───
export enum OnChainRiskLevel {
  LOW = 0,    // score 0-33
  MEDIUM = 1, // score 34-66
  HIGH = 2,   // score 67-100
}

// ─── Types ───
export interface OnChainReport {
  targetAddress: string;
  riskScore: number;
  riskLevel: string;
  reportHash: string;
  timestamp: string;
  analyzer: string;
}

export interface SubmitResult {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  gasUsed?: string;
  reportHash?: string;
  error?: string;
}

export interface RegistryInfo {
  contractAddress: string;
  network: string;
  totalReports: number;
  analyzerApproved: boolean;
  analyzerAddress: string;
}

// ─── Provider & Wallet (lazy init) ───
let _provider: ethers.JsonRpcProvider | null = null;
let _wallet: ethers.Wallet | null = null;
let _readContract: ethers.Contract | null = null;
let _writeContract: ethers.Contract | null = null;

function getProvider(): ethers.JsonRpcProvider {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(RPC_URL);
  }
  return _provider;
}

function getReadContract(): ethers.Contract {
  if (!_readContract) {
    _readContract = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, getProvider());
  }
  return _readContract;
}

function getWriteContract(): ethers.Contract | null {
  if (!ANALYZER_PRIVATE_KEY) {
    return null;
  }
  if (!_writeContract) {
    _wallet = new ethers.Wallet(ANALYZER_PRIVATE_KEY, getProvider());
    _writeContract = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, _wallet);
  }
  return _writeContract;
}

function getAnalyzerAddress(): string {
  if (!ANALYZER_PRIVATE_KEY) return '';
  if (!_wallet) {
    _wallet = new ethers.Wallet(ANALYZER_PRIVATE_KEY);
  }
  return _wallet.address;
}

// ─── Helpers ───

/**
 * Convert a risk score (0-100) to the on-chain RiskLevel enum
 */
export function scoreToRiskLevel(score: number): OnChainRiskLevel {
  if (score <= 33) return OnChainRiskLevel.LOW;
  if (score <= 66) return OnChainRiskLevel.MEDIUM;
  return OnChainRiskLevel.HIGH;
}

const RISK_LEVEL_LABELS = ['LOW', 'MEDIUM', 'HIGH'] as const;

function riskLevelToString(level: number): string {
  return RISK_LEVEL_LABELS[level] || 'UNKNOWN';
}

/**
 * Hash a risk report object to produce the on-chain proof
 */
export function hashReport(report: object): string {
  const json = JSON.stringify(report);
  return ethers.keccak256(ethers.toUtf8Bytes(json));
}

// ─── Write Operations ───

/**
 * Submit a single risk report to the on-chain registry
 */
export async function submitReport(
  targetAddress: string,
  riskScore: number,
  reportData: object
): Promise<SubmitResult> {
  const contract = getWriteContract();
  if (!contract) {
    logger.warn('[Registry] No analyzer private key configured — skipping on-chain submission');
    return { success: false, error: 'Analyzer private key not configured' };
  }

  const reportHash = hashReport(reportData);
  const riskLevel = scoreToRiskLevel(riskScore);

  try {
    logger.info(`[Registry] Submitting report for ${targetAddress} (score=${riskScore}, level=${riskLevelToString(riskLevel)})`);

    const tx = await contract.submitRiskReport(targetAddress, riskScore, riskLevel, reportHash);
    const receipt = await tx.wait();

    logger.info(`[Registry] Report submitted: tx=${receipt.hash}, block=${receipt.blockNumber}, gas=${receipt.gasUsed.toString()}`);

    return {
      success: true,
      txHash: receipt.hash,
      blockNumber: Number(receipt.blockNumber),
      gasUsed: receipt.gasUsed.toString(),
      reportHash,
    };
  } catch (err: any) {
    const message = err?.reason || err?.message || 'Unknown error';
    logger.error(`[Registry] Submit failed: ${message}`);
    return { success: false, error: message, reportHash };
  }
}

// ─── Read Operations ───

/**
 * Get the latest on-chain report for a target address.
 * Returns null if no reports exist.
 */
export async function getLatestReport(targetAddress: string): Promise<OnChainReport | null> {
  const contract = getReadContract();

  try {
    const report = await contract.getLatestReportForTarget(targetAddress);
    return {
      targetAddress: report.targetAddress,
      riskScore: Number(report.riskScore),
      riskLevel: riskLevelToString(Number(report.riskLevel)),
      reportHash: report.reportHash,
      timestamp: new Date(Number(report.timestamp) * 1000).toISOString(),
      analyzer: report.analyzer,
    };
  } catch {
    // NoReportsForTarget or RPC error
    return null;
  }
}

/**
 * Get the count of on-chain reports for a target address
 */
export async function getReportCount(targetAddress: string): Promise<number> {
  const contract = getReadContract();

  try {
    const count = await contract.getReportCountForTarget(targetAddress);
    return Number(count);
  } catch {
    return 0;
  }
}

/**
 * Get total number of reports in the registry
 */
export async function getTotalReports(): Promise<number> {
  const contract = getReadContract();

  try {
    const count = await contract.getTotalReports();
    return Number(count);
  } catch {
    return 0;
  }
}

/**
 * Check if the configured analyzer is approved on-chain
 */
export async function isAnalyzerApproved(): Promise<boolean> {
  const address = getAnalyzerAddress();
  if (!address) return false;

  const contract = getReadContract();

  try {
    return await contract.approvedAnalyzers(address);
  } catch {
    return false;
  }
}

/**
 * Get registry contract info (for health checks and frontend display)
 */
export async function getRegistryInfo(): Promise<RegistryInfo> {
  const analyzerAddress = getAnalyzerAddress();
  const [totalReports, approved] = await Promise.all([
    getTotalReports(),
    analyzerAddress ? isAnalyzerApproved() : Promise.resolve(false),
  ]);

  return {
    contractAddress: REGISTRY_ADDRESS,
    network: RPC_URL.includes('testnet') || RPC_URL.includes('prebsc') ? 'bnbTestnet' : 'bnbMainnet',
    totalReports,
    analyzerApproved: approved,
    analyzerAddress,
  };
}

/**
 * Get all on-chain reports for a target address
 */
export async function getReportsForTarget(targetAddress: string): Promise<OnChainReport[]> {
  const contract = getReadContract();

  try {
    const indices: bigint[] = await contract.getReportsByTarget(targetAddress);
    if (indices.length === 0) return [];

    const reports = await Promise.all(
      indices.map(async (index) => {
        const r = await contract.getReport(index);
        return {
          targetAddress: r.targetAddress,
          riskScore: Number(r.riskScore),
          riskLevel: riskLevelToString(Number(r.riskLevel)),
          reportHash: r.reportHash,
          timestamp: new Date(Number(r.timestamp) * 1000).toISOString(),
          analyzer: r.analyzer,
        };
      })
    );

    return reports;
  } catch {
    return [];
  }
}
