/**
 * Deep Contract Analyzer Module
 * Evidence-based smart contract security analysis with source code inspection
 */

import { ethers } from 'ethers';
import logger from '../../utils/logger';
import {
  getContractSourceCode,
  isContractVerified,
  getBscScanUrl,
  getBscScanSourceUrl,
} from '../../services/bscscanService';
import type { ContractAnalysis, EvidenceFlag, Severity } from '../../types/risk';

const RPC_URL = process.env.BNB_RPC_URL || 'https://bsc-dataseed.binance.org/';

const PROXY_PATTERNS = [
  '363d3d373d3d3d363d73', // EIP-1167 minimal proxy
  '5860208158601c335a63',  // EIP-1167 variant
];

// Dangerous function signatures in source code
const DANGEROUS_PATTERNS: Array<{
  id: string;
  name: string;
  pattern: RegExp;
  severity: Severity;
  description: string;
}> = [
  {
    id: 'owner_withdraw',
    name: 'Owner Withdraw Function',
    pattern: /function\s+(?:withdraw|drain|sweep|emergencyWithdraw)\s*\([^)]*\)[^{]*\{[^}]*(?:onlyOwner|_owner|owner\(\))/s,
    severity: 'high',
    description: 'Owner can withdraw funds from the contract at any time, potentially draining user deposits.',
  },
  {
    id: 'mint_function',
    name: 'Unrestricted Mint Function',
    pattern: /function\s+(?:mint|_mint)\s*\([^)]*\)[^{]*(?:public|external)[^{]*\{/s,
    severity: 'high',
    description: 'Contract can mint new tokens, potentially diluting holder value through unlimited supply inflation.',
  },
  {
    id: 'owner_mint',
    name: 'Owner Mint Privileges',
    pattern: /function\s+mint\s*\([^)]*\)[^{]*(?:onlyOwner|onlyMinter)/s,
    severity: 'medium',
    description: 'Owner has exclusive minting privileges, which could be used to inflate supply.',
  },
  {
    id: 'selfdestruct',
    name: 'Self-Destruct Capability',
    pattern: /selfdestruct\s*\(|suicide\s*\(/,
    severity: 'critical',
    description: 'Contract contains selfdestruct opcode which can permanently destroy the contract and send remaining funds to a specified address.',
  },
  {
    id: 'no_renounce',
    name: 'No Ownership Renouncement',
    pattern: /Ownable/,
    severity: 'medium',
    description: 'Contract uses Ownable pattern. Check if renounceOwnership has been called - if not, owner retains full control.',
  },
  {
    id: 'blacklist',
    name: 'Blacklist / Whitelist Function',
    pattern: /function\s+(?:blacklist|addToBlacklist|setBlacklist|exclude|ban)\s*\(/,
    severity: 'high',
    description: 'Contract can blacklist addresses, preventing them from transferring or selling tokens (honeypot indicator).',
  },
  {
    id: 'pause_trading',
    name: 'Trading Pause Mechanism',
    pattern: /function\s+(?:pause|unpause|setPaused|toggleTrading|setTradingEnabled)\s*\(/,
    severity: 'high',
    description: 'Owner can pause trading at any time, preventing holders from selling their tokens.',
  },
  {
    id: 'fee_manipulation',
    name: 'Adjustable Transaction Fee',
    pattern: /function\s+(?:setFee|setTax|setTaxRate|updateFee|changeFee|setBuyFee|setSellFee)\s*\(/,
    severity: 'high',
    description: 'Owner can change transaction fees. Malicious actors set fees to 100% after gaining liquidity.',
  },
  {
    id: 'max_tx_limit',
    name: 'Adjustable Max Transaction',
    pattern: /function\s+(?:setMaxTx|setMaxTransaction|setMaxTransferAmount|updateMaxTx)\s*\(/,
    severity: 'medium',
    description: 'Owner can limit max transaction amount, which can be set to near-zero to prevent selling.',
  },
  {
    id: 'hidden_transfer_logic',
    name: 'Hidden Transfer Restrictions',
    pattern: /function\s+_transfer\s*\([^)]*\)[^{]*\{[^}]*(?:require\s*\([^)]*(?:_isExcluded|isBot|_blacklist|tradingOpen))/s,
    severity: 'critical',
    description: 'Transfer function contains hidden restrictions that may prevent certain addresses from selling.',
  },
  {
    id: 'proxy_upgradeable',
    name: 'Upgradeable Proxy Pattern',
    pattern: /(?:upgradeTo|upgradeToAndCall|_setImplementation|TransparentUpgradeableProxy|UUPSUpgradeable)/,
    severity: 'high',
    description: 'Contract is upgradeable via proxy pattern - the owner can change all logic including transferring funds.',
  },
  {
    id: 'delegatecall',
    name: 'Delegatecall Usage',
    pattern: /delegatecall\s*\(/,
    severity: 'high',
    description: 'Contract uses delegatecall which executes external code in the contract\'s context, a common attack vector.',
  },
];

// Bytecode-level dangerous patterns (4-byte function selectors)
const BYTECODE_SELECTORS: Array<{
  id: string;
  name: string;
  selector: string;
  severity: Severity;
  description: string;
}> = [
  {
    id: 'bytecode_selfdestruct',
    name: 'Selfdestruct Opcode',
    selector: 'ff', // SELFDESTRUCT opcode
    severity: 'critical',
    description: 'Bytecode contains SELFDESTRUCT opcode.',
  },
];

function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(RPC_URL, { name: 'bnb', chainId: 56 });
}

/**
 * Deep contract analysis with evidence-based flagging
 */
export async function analyzeContract(address: string): Promise<ContractAnalysis> {
  const provider = getProvider();
  const flags: EvidenceFlag[] = [];
  let score = 0;

  const detections = {
    ownerPrivileges: false,
    withdrawFunctions: false,
    mintFunctions: false,
    proxyPattern: false,
    noRenounceOwnership: false,
    upgradeability: false,
    selfDestruct: false,
    honeypotLogic: false,
  };

  try {
    // Step 1: Get bytecode
    const code = await provider.getCode(address).catch(() => '0x');
    const isContract = code !== '0x' && code.length > 2;
    const codeSize = isContract ? (code.length - 2) / 2 : 0;

    if (!isContract) {
      return {
        isContract: false,
        isVerified: false,
        codeSize: 0,
        sourceCodeAvailable: false,
        flags: [],
        score: 0,
        detections,
      };
    }

    const codeLower = code.toLowerCase();
    const bscscanLink = getBscScanUrl(address);
    const sourceLink = getBscScanSourceUrl(address);

    // Step 2: Check proxy patterns in bytecode
    const isProxy = PROXY_PATTERNS.some(p => codeLower.includes(p));
    if (isProxy) {
      detections.proxyPattern = true;
      const flag: EvidenceFlag = {
        id: 'proxy_detected',
        name: 'Proxy Contract Detected',
        severity: 'high',
        description: 'This contract uses a proxy pattern (EIP-1167). The actual logic resides in a separate implementation contract that the owner can change.',
        evidence: 'EIP-1167 minimal proxy bytecode pattern detected in contract bytecode.',
        category: 'contract',
        source: 'Bytecode Analysis',
        bscscanLink,
        riskWeight: 15,
      };
      flags.push(flag);
      score += 15;
    }

    // Step 3: Check bytecode selfdestruct
    if (codeLower.includes('ff')) {
      // This is approximate - would need full opcode parsing for accuracy
      // We'll confirm via source code analysis below
    }

    // Step 4: Code size analysis
    if (codeSize < 100) {
      flags.push({
        id: 'tiny_bytecode',
        name: 'Minimal Bytecode',
        severity: 'medium',
        description: 'Contract has very small bytecode, possibly a minimal proxy stub or placeholder.',
        evidence: `Contract bytecode is only ${codeSize} bytes.`,
        category: 'contract',
        source: 'Bytecode Analysis',
        bscscanLink,
        riskWeight: 10,
      });
      score += 10;
    } else if (codeSize > 24576) {
      flags.push({
        id: 'large_bytecode',
        name: 'Large Complex Contract',
        severity: 'low',
        description: 'Contract has large bytecode exceeding EIP-170 limit recommendation, making it harder to audit.',
        evidence: `Contract bytecode is ${codeSize} bytes (limit: 24,576).`,
        category: 'contract',
        source: 'Bytecode Analysis',
        bscscanLink,
        riskWeight: 5,
      });
      score += 5;
    }

    // Step 5: Source code verification and analysis
    let isVerified = false;
    let sourceCodeAvailable = false;
    let compilerVersion: string | undefined;

    try {
      const sourceData = await getContractSourceCode(address);

      if (sourceData && sourceData.ABI !== 'Contract source code not verified') {
        isVerified = true;
        sourceCodeAvailable = true;
        compilerVersion = sourceData.CompilerVersion;

        const sourceCode = sourceData.SourceCode;

        // Analyze source code for dangerous patterns
        for (const pattern of DANGEROUS_PATTERNS) {
          if (pattern.pattern.test(sourceCode)) {
            let codeSnippet: string | undefined;

            // Extract matching code snippet (first 200 chars of match)
            const match = sourceCode.match(pattern.pattern);
            if (match) {
              codeSnippet = match[0].substring(0, 200).trim();
              if (match[0].length > 200) codeSnippet += '...';
            }

            const flag: EvidenceFlag = {
              id: pattern.id,
              name: pattern.name,
              severity: pattern.severity,
              description: pattern.description,
              evidence: `Pattern detected in verified source code on BscScan.`,
              category: 'contract',
              source: 'Source Code Analysis',
              codeSnippet,
              bscscanLink: sourceLink,
              riskWeight: getSeverityWeight(pattern.severity),
            };
            flags.push(flag);
            score += getSeverityWeight(pattern.severity);

            // Update detections
            if (pattern.id === 'owner_withdraw') detections.withdrawFunctions = true;
            if (pattern.id === 'mint_function' || pattern.id === 'owner_mint') detections.mintFunctions = true;
            if (pattern.id === 'selfdestruct') detections.selfDestruct = true;
            if (pattern.id === 'no_renounce') detections.noRenounceOwnership = true;
            if (pattern.id === 'proxy_upgradeable') {
              detections.upgradeability = true;
              detections.proxyPattern = true;
            }
            if (pattern.id === 'blacklist' || pattern.id === 'hidden_transfer_logic' || pattern.id === 'pause_trading') {
              detections.honeypotLogic = true;
            }
            if (pattern.id === 'fee_manipulation' || pattern.id === 'owner_withdraw') {
              detections.ownerPrivileges = true;
            }
          }
        }

        // Check for renounceOwnership call
        if (/Ownable/.test(sourceCode) && !/renounceOwnership/.test(sourceCode)) {
          detections.noRenounceOwnership = true;
          flags.push({
            id: 'no_renounce_impl',
            name: 'Ownership Not Renounceable',
            severity: 'medium',
            description: 'Contract uses Ownable but does not implement renounceOwnership, meaning the owner permanently retains control.',
            evidence: 'Ownable pattern found but renounceOwnership function is missing from source.',
            category: 'contract',
            source: 'Source Code Analysis',
            bscscanLink: sourceLink,
            riskWeight: 10,
          });
          score += 10;
        }

        // Check proxy in source code
        if (sourceData.Proxy === '1' && sourceData.Implementation) {
          detections.proxyPattern = true;
          detections.upgradeability = true;
          flags.push({
            id: 'bscscan_proxy',
            name: 'BscScan Confirmed Proxy',
            severity: 'high',
            description: `Contract is a confirmed proxy pointing to implementation: ${sourceData.Implementation}`,
            evidence: `BscScan proxy verification confirms implementation at ${sourceData.Implementation}.`,
            category: 'contract',
            source: 'BscScan',
            bscscanLink: sourceLink,
            riskWeight: 15,
          });
          score += 15;
        }
      } else {
        // Source not verified
        flags.push({
          id: 'unverified_source',
          name: 'Source Code Not Verified',
          severity: 'high',
          description: 'Contract source code is not verified on BscScan. Cannot inspect for malicious logic. This is a significant transparency concern.',
          evidence: 'BscScan API confirms source code is not verified for this contract.',
          category: 'contract',
          source: 'BscScan',
          bscscanLink: sourceLink,
          riskWeight: 20,
        });
        score += 20;
      }
    } catch (error) {
      logger.warn(`BscScan source code check failed for ${address}`, { error });
      flags.push({
        id: 'source_check_failed',
        name: 'Source Verification Unavailable',
        severity: 'medium',
        description: 'Unable to verify contract source code via BscScan API.',
        evidence: 'BscScan API request failed or timed out.',
        category: 'contract',
        source: 'BscScan',
        bscscanLink: sourceLink,
        riskWeight: 10,
      });
      score += 10;
    }

    // Step 6: Check contract activity
    const txCount = await provider.getTransactionCount(address).catch(() => 0);
    if (txCount === 0) {
      flags.push({
        id: 'no_outgoing_tx',
        name: 'No Outgoing Transactions',
        severity: 'low',
        description: 'Contract has zero outgoing transactions, suggesting it may be newly deployed or inactive.',
        evidence: `Transaction count (nonce) is 0.`,
        category: 'contract',
        source: 'RPC',
        bscscanLink,
        riskWeight: 5,
      });
      score += 5;
    }

    logger.info(`Deep contract analysis for ${address}: verified=${isVerified}, flags=${flags.length}, score=${score}`);

    return {
      isContract: true,
      isVerified,
      codeSize,
      compilerVersion,
      sourceCodeAvailable,
      flags,
      score: Math.min(score, 100),
      detections,
    };
  } catch (error) {
    logger.error(`Contract analysis failed for ${address}:`, { error });
    return {
      isContract: false,
      isVerified: false,
      codeSize: 0,
      sourceCodeAvailable: false,
      flags: [{
        id: 'analysis_failed',
        name: 'Contract Analysis Failed',
        severity: 'medium',
        description: 'Unable to complete contract analysis due to RPC or API error.',
        evidence: 'Analysis module encountered an error during execution.',
        category: 'contract',
        source: 'System',
        riskWeight: 15,
      }],
      score: 30,
      detections,
    };
  }
}

function getSeverityWeight(severity: Severity): number {
  switch (severity) {
    case 'critical': return 20;
    case 'high': return 15;
    case 'medium': return 10;
    case 'low': return 5;
    case 'info': return 2;
  }
}
