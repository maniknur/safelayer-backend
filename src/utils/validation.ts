/**
 * Validate Ethereum/BNB Chain address format
 */
export function isValidAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  const addressRegex = /^0x[a-fA-F0-9]{40}$/;
  return addressRegex.test(address.trim());
}

/**
 * Normalize address to lowercase (checksumless form)
 */
export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}
