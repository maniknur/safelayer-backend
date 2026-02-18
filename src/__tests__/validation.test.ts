import { isValidAddress, normalizeAddress } from '../utils/validation';

describe('Address Validation', () => {
  describe('isValidAddress', () => {
    it('should accept valid Ethereum addresses', () => {
      const validAddresses = [
        '0x1234567890123456789012345678901234567890',
        '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD',
      ];

      validAddresses.forEach((addr) => {
        expect(isValidAddress(addr)).toBe(true);
      });
    });

    it('should reject invalid addresses', () => {
      const invalidAddresses = [
        '0x123', // too short
        '0x12345678901234567890123456789012345678901234', // too long
        '123456789012345678901234567890123456789012', // no 0x prefix
        '0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG', // invalid hex
        '', // empty
        'not an address',
      ];

      invalidAddresses.forEach((addr) => {
        expect(isValidAddress(addr)).toBe(false);
      });
    });
  });

  describe('normalizeAddress', () => {
    it('should convert addresses to lowercase', () => {
      const address = '0xABCDEF123456ABCDEF123456ABCDEF123456ABCD';
      expect(normalizeAddress(address)).toBe('0xabcdef123456abcdef123456abcdef123456abcd');
    });

    it('should handle already lowercase addresses', () => {
      const address = '0xabcdef123456abcdef123456abcdef123456abcd';
      expect(normalizeAddress(address)).toBe(address);
    });
  });
});
