/**
 * BscScan API Service
 * Fetches contract source code, ABI, and verification data from BscScan
 */

import logger from '../utils/logger';

const BSCSCAN_API_URL = 'https://api.bscscan.com/api';
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || '';
const REQUEST_TIMEOUT = 10_000;

export interface BscScanSourceCode {
  SourceCode: string;
  ABI: string;
  ContractName: string;
  CompilerVersion: string;
  OptimizationUsed: string;
  Runs: string;
  ConstructorArguments: string;
  EVMVersion: string;
  Library: string;
  LicenseType: string;
  Proxy: string;
  Implementation: string;
  SwarmSource: string;
}

export interface BscScanTxListItem {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasUsed: string;
  isError: string;
  functionName: string;
  contractAddress: string;
}

async function fetchBscScan(params: Record<string, string>): Promise<any> {
  const url = new URL(BSCSCAN_API_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  if (BSCSCAN_API_KEY) {
    url.searchParams.set('apikey', BSCSCAN_API_KEY);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    const data = await response.json();
    return data;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logger.warn('BscScan API request timed out');
    } else {
      logger.warn('BscScan API request failed:', { error: error.message });
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Get contract source code and verification status
 */
export async function getContractSourceCode(address: string): Promise<BscScanSourceCode | null> {
  const data = await fetchBscScan({
    module: 'contract',
    action: 'getsourcecode',
    address,
  });

  if (!data || data.status !== '1' || !data.result?.[0]) {
    return null;
  }

  return data.result[0] as BscScanSourceCode;
}

/**
 * Check if contract source code is verified on BscScan
 */
export async function isContractVerified(address: string): Promise<boolean> {
  const source = await getContractSourceCode(address);
  if (!source) return false;
  return source.ABI !== 'Contract source code not verified';
}

/**
 * Get normal transactions for an address (most recent)
 */
export async function getTransactionList(
  address: string,
  page = 1,
  offset = 50
): Promise<BscScanTxListItem[]> {
  const data = await fetchBscScan({
    module: 'account',
    action: 'txlist',
    address,
    startblock: '0',
    endblock: '99999999',
    page: page.toString(),
    offset: offset.toString(),
    sort: 'desc',
  });

  if (!data || data.status !== '1' || !Array.isArray(data.result)) {
    return [];
  }

  return data.result as BscScanTxListItem[];
}

/**
 * Get internal transactions (contract calls)
 */
export async function getInternalTransactions(
  address: string,
  page = 1,
  offset = 50
): Promise<BscScanTxListItem[]> {
  const data = await fetchBscScan({
    module: 'account',
    action: 'txlistinternal',
    address,
    startblock: '0',
    endblock: '99999999',
    page: page.toString(),
    offset: offset.toString(),
    sort: 'desc',
  });

  if (!data || data.status !== '1' || !Array.isArray(data.result)) {
    return [];
  }

  return data.result as BscScanTxListItem[];
}

/**
 * Get token transfers for an address
 */
export async function getTokenTransfers(
  address: string,
  page = 1,
  offset = 50
): Promise<any[]> {
  const data = await fetchBscScan({
    module: 'account',
    action: 'tokentx',
    address,
    startblock: '0',
    endblock: '99999999',
    page: page.toString(),
    offset: offset.toString(),
    sort: 'desc',
  });

  if (!data || data.status !== '1' || !Array.isArray(data.result)) {
    return [];
  }

  return data.result;
}

/**
 * Get contract creation info (deployer address)
 */
export async function getContractCreation(
  addresses: string[]
): Promise<Array<{ contractAddress: string; contractCreator: string; txHash: string }>> {
  const data = await fetchBscScan({
    module: 'contract',
    action: 'getcontractcreation',
    contractaddresses: addresses.join(','),
  });

  if (!data || data.status !== '1' || !Array.isArray(data.result)) {
    return [];
  }

  return data.result;
}

/**
 * Get BscScan URL for an address
 */
export function getBscScanUrl(address: string): string {
  return `https://bscscan.com/address/${address}`;
}

/**
 * Get BscScan URL for a contract's source code
 */
export function getBscScanSourceUrl(address: string): string {
  return `https://bscscan.com/address/${address}#code`;
}
