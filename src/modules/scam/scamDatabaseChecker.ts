/**
 * Scam Database Checker Module
 * Checks addresses against known scam lists, rugpull databases,
 * and blacklist signals
 */

import logger from '../../utils/logger';
import type { ScamDatabaseAnalysis, EvidenceFlag } from '../../types/risk';

// ─── Known Scam / Rugpull Addresses (curated list) ───
// In production, this would be fetched from an external API or database
const KNOWN_SCAM_ADDRESSES: Record<string, { name: string; type: string; source: string }> = {
  // Example known scam addresses on BSC
  '0x0000000000000000000000000000000000000001': { name: 'Test Scam', type: 'rugpull', source: 'Internal' },
};

// Known scam deployer wallets
const KNOWN_SCAM_DEPLOYERS = new Set<string>([
  // Add known scam deployer addresses here (lowercase)
]);

// Known honeypot contract patterns (addresses that are confirmed honeypots)
const KNOWN_HONEYPOTS = new Set<string>([
  // Add known honeypot addresses here (lowercase)
]);

// Blacklisted addresses from community reports
const COMMUNITY_BLACKLIST = new Set<string>([
  // Add community-reported blacklisted addresses here (lowercase)
]);

/**
 * Check if address appears in any scam database
 */
export async function checkScamDatabase(
  address: string,
  deployerAddress?: string,
  deployedContracts?: string[]
): Promise<ScamDatabaseAnalysis> {
  const flags: EvidenceFlag[] = [];
  let score = 0;
  const matchedDatabase: string[] = [];
  let isBlacklisted = false;
  let knownScam = false;
  let rugpullHistory = false;

  const normalizedAddress = address.toLowerCase();

  try {
    // ─── Check Known Scam List ───
    const scamEntry = KNOWN_SCAM_ADDRESSES[normalizedAddress];
    if (scamEntry) {
      knownScam = true;
      matchedDatabase.push(`Internal Scam DB: ${scamEntry.name}`);
      flags.push({
        id: 'known_scam', name: 'Known Scam Address', severity: 'critical',
        description: `This address is listed in the SafeLayer scam database as "${scamEntry.name}" (${scamEntry.type}).`,
        evidence: `Matched in ${scamEntry.source} database. Classification: ${scamEntry.type}.`,
        category: 'scam', source: scamEntry.source, riskWeight: 30,
      });
      score += 30;
    }

    // ─── Check Known Scam Deployers ───
    if (deployerAddress && KNOWN_SCAM_DEPLOYERS.has(deployerAddress.toLowerCase())) {
      knownScam = true;
      matchedDatabase.push('Known Scam Deployer Registry');
      flags.push({
        id: 'scam_deployer', name: 'Deployed by Known Scam Wallet', severity: 'critical',
        description: 'The wallet that deployed this contract is flagged as a known scam deployer.',
        evidence: `Deployer ${deployerAddress.slice(0, 10)}... is in the scam deployer registry.`,
        category: 'scam', source: 'SafeLayer', riskWeight: 25,
      });
      score += 25;
    }

    // ─── Check Honeypot Registry ───
    if (KNOWN_HONEYPOTS.has(normalizedAddress)) {
      isBlacklisted = true;
      matchedDatabase.push('Honeypot Registry');
      flags.push({
        id: 'known_honeypot', name: 'Confirmed Honeypot', severity: 'critical',
        description: 'This contract is a confirmed honeypot - tokens can be bought but not sold.',
        evidence: 'Address matched in the honeypot contract registry.',
        category: 'scam', source: 'Honeypot Registry', riskWeight: 30,
      });
      score += 30;
    }

    // ─── Check Community Blacklist ───
    if (COMMUNITY_BLACKLIST.has(normalizedAddress)) {
      isBlacklisted = true;
      matchedDatabase.push('Community Blacklist');
      flags.push({
        id: 'community_blacklist', name: 'Community Blacklisted', severity: 'high',
        description: 'This address has been reported and blacklisted by the community.',
        evidence: 'Address found in community-curated blacklist.',
        category: 'scam', source: 'Community Reports', riskWeight: 20,
      });
      score += 20;
    }

    // ─── Check Deployed Contracts for Rugpull Patterns ───
    if (deployedContracts && deployedContracts.length > 0) {
      for (const contractAddr of deployedContracts) {
        const normalizedContract = contractAddr.toLowerCase();
        if (KNOWN_SCAM_ADDRESSES[normalizedContract]) {
          rugpullHistory = true;
          matchedDatabase.push(`Linked Rugpull: ${contractAddr.slice(0, 10)}...`);
          flags.push({
            id: `linked_rug_${contractAddr.slice(0, 8)}`,
            name: 'Linked to Known Rugpull',
            severity: 'critical',
            description: `This address has deployed or is linked to a known rugpull contract.`,
            evidence: `Deployed contract ${contractAddr.slice(0, 10)}... is flagged as a rugpull.`,
            category: 'scam', source: 'SafeLayer', riskWeight: 25,
          });
          score += 25;
          break; // One link is enough for max severity
        }
      }
    }

    // ─── Heuristic: Check Address Patterns ───
    // Some scam tokens reuse similar address prefixes from vanity generators
    // This is a basic heuristic - in production, use ML pattern matching
    const addressPrefix = normalizedAddress.slice(2, 10);
    const suspiciousPrefixes = ['00000000', 'deadbeef', 'ffffffff'];
    if (suspiciousPrefixes.includes(addressPrefix)) {
      flags.push({
        id: 'suspicious_prefix', name: 'Suspicious Address Pattern', severity: 'low',
        description: 'Address uses a vanity/generated prefix pattern sometimes associated with scam contracts.',
        evidence: `Address prefix 0x${addressPrefix} matches known suspicious pattern.`,
        category: 'scam', source: 'Pattern Analysis', riskWeight: 5,
      });
      score += 5;
    }

    // ─── Clean Report ───
    if (flags.length === 0) {
      flags.push({
        id: 'clean_scam_check', name: 'No Scam Records Found', severity: 'info',
        description: 'This address was not found in any scam databases or blacklists checked by SafeLayer.',
        evidence: 'Checked: Internal Scam DB, Honeypot Registry, Community Blacklist, Deployer Registry.',
        category: 'scam', source: 'SafeLayer', riskWeight: 0,
      });
    }

    logger.info(`Scam database check for ${address}: scam=${knownScam}, blacklisted=${isBlacklisted}, score=${score}`);

    return {
      flags,
      score: Math.min(score, 100),
      isBlacklisted,
      knownScam,
      rugpullHistory,
      matchedDatabase,
    };
  } catch (error) {
    logger.error(`Scam database check failed for ${address}:`, { error });
    return {
      flags: [{
        id: 'scam_check_error', name: 'Scam Check Error', severity: 'low',
        description: 'Unable to complete scam database check.',
        evidence: 'Database lookup encountered an error.',
        category: 'scam', source: 'System', riskWeight: 5,
      }],
      score: 5,
      isBlacklisted: false,
      knownScam: false,
      rugpullHistory: false,
      matchedDatabase: [],
    };
  }
}
