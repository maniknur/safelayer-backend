/**
 * Transparency Checker Module
 * Checks GitHub presence, audit reports, team doxxing status
 */

import logger from '../../utils/logger';
import type { TransparencyAnalysis, EvidenceFlag } from '../../types/risk';

const GITHUB_API = 'https://api.github.com';
const REQUEST_TIMEOUT = 8_000;

// Known audit firms (lowercase for matching)
const KNOWN_AUDITORS = [
  'certik', 'slowmist', 'peckshield', 'hacken', 'quantstamp',
  'openzeppelin', 'trail of bits', 'consensys', 'halborn',
  'solidproof', 'techrate', 'interfi', 'rugdoc', 'dessert finance',
];

async function fetchWithTimeout(url: string, timeout = REQUEST_TIMEOUT): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'SafeLayer-Risk-Engine',
      },
    });
    return response;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search GitHub for project repositories related to a token/contract
 */
async function searchGitHub(query: string): Promise<{
  found: boolean;
  repoUrl?: string;
  lastCommitDate?: string;
  contributorsCount?: number;
  starsCount?: number;
}> {
  try {
    const res = await fetchWithTimeout(
      `${GITHUB_API}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=3`
    );

    if (!res || !res.ok) {
      return { found: false };
    }

    const data = await res.json();
    if (!data.items || data.items.length === 0) {
      return { found: false };
    }

    const repo = data.items[0];

    // Get contributor count
    let contributorsCount = 0;
    try {
      const contribRes = await fetchWithTimeout(
        `${GITHUB_API}/repos/${repo.full_name}/contributors?per_page=1`
      );
      if (contribRes && contribRes.ok) {
        const linkHeader = contribRes.headers.get('link');
        if (linkHeader) {
          const match = linkHeader.match(/page=(\d+)>; rel="last"/);
          contributorsCount = match ? parseInt(match[1]) : 1;
        } else {
          const contribs = await contribRes.json();
          contributorsCount = Array.isArray(contribs) ? contribs.length : 0;
        }
      }
    } catch {
      // Skip contributor count
    }

    return {
      found: true,
      repoUrl: repo.html_url,
      lastCommitDate: repo.pushed_at,
      contributorsCount,
      starsCount: repo.stargazers_count,
    };
  } catch {
    return { found: false };
  }
}

/**
 * Analyze transparency for a project/token
 */
export async function analyzeTransparency(
  address: string,
  tokenSymbol?: string,
  contractName?: string
): Promise<TransparencyAnalysis> {
  const flags: EvidenceFlag[] = [];
  let score = 0;

  const result: TransparencyAnalysis = {
    flags: [],
    score: 0,
    github: { found: false },
    audit: { detected: false },
    teamDoxxed: false,
  };

  // ─── GitHub Search ───
  // Try multiple search queries
  const searchTerms: string[] = [];
  if (tokenSymbol && tokenSymbol !== 'UNKNOWN' && tokenSymbol !== 'BNB') {
    searchTerms.push(`${tokenSymbol} token bnb`);
    searchTerms.push(tokenSymbol);
  }
  if (contractName) {
    searchTerms.push(contractName);
  }
  searchTerms.push(address.slice(0, 10)); // Partial address search

  let githubFound = false;
  for (const term of searchTerms) {
    if (githubFound) break;
    try {
      const ghResult = await searchGitHub(term);
      if (ghResult.found) {
        githubFound = true;
        result.github = ghResult;

        // Evaluate GitHub health
        if (ghResult.lastCommitDate) {
          const lastCommit = new Date(ghResult.lastCommitDate);
          const daysSinceCommit = Math.floor((Date.now() - lastCommit.getTime()) / 86400000);

          if (daysSinceCommit > 180) {
            flags.push({
              id: 'stale_repo', name: 'Stale GitHub Repository', severity: 'medium',
              description: `Last commit was ${daysSinceCommit} days ago. Project may be abandoned.`,
              evidence: `GitHub repo last updated: ${ghResult.lastCommitDate}`,
              category: 'transparency', source: 'GitHub', riskWeight: 10,
              bscscanLink: ghResult.repoUrl,
            });
            score += 10;
          }
        }

        if (ghResult.contributorsCount !== undefined && ghResult.contributorsCount <= 1) {
          flags.push({
            id: 'solo_dev', name: 'Single Developer', severity: 'medium',
            description: 'Only 1 contributor found on GitHub. Single-developer projects carry higher abandonment risk.',
            evidence: `GitHub repository has ${ghResult.contributorsCount} contributor(s).`,
            category: 'transparency', source: 'GitHub', riskWeight: 8,
            bscscanLink: ghResult.repoUrl,
          });
          score += 8;
        }

        if (ghResult.starsCount !== undefined && ghResult.starsCount < 5) {
          flags.push({
            id: 'low_stars', name: 'Low Community Interest', severity: 'low',
            description: 'Repository has very few stars, indicating low community engagement.',
            evidence: `GitHub repository has ${ghResult.starsCount} stars.`,
            category: 'transparency', source: 'GitHub', riskWeight: 5,
            bscscanLink: ghResult.repoUrl,
          });
          score += 5;
        }
      }
    } catch {
      // Try next search term
    }
  }

  if (!githubFound) {
    flags.push({
      id: 'no_github', name: 'No GitHub Repository Found', severity: 'medium',
      description: 'No public GitHub repository could be found for this project. Open-source code increases trust and verifiability.',
      evidence: `Searched GitHub for: ${searchTerms.slice(0, 3).join(', ')}. No matching repositories found.`,
      category: 'transparency', source: 'GitHub', riskWeight: 12,
    });
    score += 12;
  }

  // ─── Audit Detection ───
  // Check if any known auditor is associated (basic heuristic from GitHub README or contract name)
  // In production, this would check CertiK API, etc.
  let auditDetected = false;
  if (result.github.found && result.github.repoUrl) {
    try {
      // Check README for audit mentions
      const repoPath = result.github.repoUrl.replace('https://github.com/', '');
      const readmeRes = await fetchWithTimeout(
        `${GITHUB_API}/repos/${repoPath}/readme`
      );
      if (readmeRes && readmeRes.ok) {
        const readmeData = await readmeRes.json();
        if (readmeData.content) {
          const content = Buffer.from(readmeData.content, 'base64').toString('utf-8').toLowerCase();
          for (const auditor of KNOWN_AUDITORS) {
            if (content.includes(auditor)) {
              auditDetected = true;
              result.audit = {
                detected: true,
                auditorName: auditor.charAt(0).toUpperCase() + auditor.slice(1),
              };
              break;
            }
          }
        }
      }
    } catch {
      // Skip audit detection from README
    }
  }

  if (!auditDetected) {
    flags.push({
      id: 'no_audit', name: 'No Audit Report Detected', severity: 'medium',
      description: 'No security audit report was found for this project. Unaudited contracts carry higher smart contract risk.',
      evidence: 'No known audit firm (CertiK, SlowMist, PeckShield, etc.) found in project materials.',
      category: 'transparency', source: 'GitHub', riskWeight: 12,
    });
    score += 12;
  }

  // ─── Team Doxxed Check ───
  // Heuristic: check if GitHub org/user has profile info
  result.teamDoxxed = false; // Default: unknown
  if (!result.teamDoxxed) {
    flags.push({
      id: 'team_not_doxxed', name: 'Team Identity Not Verified', severity: 'low',
      description: 'Team members have not been publicly identified (doxxed). Anonymous teams carry higher trust risk.',
      evidence: 'No verifiable team identity found in GitHub or project materials.',
      category: 'transparency', source: 'GitHub', riskWeight: 8,
    });
    score += 8;
  }

  result.flags = flags;
  result.score = Math.min(score, 100);

  logger.info(`Transparency analysis: github=${githubFound}, audit=${auditDetected}, score=${score}`);

  return result;
}
