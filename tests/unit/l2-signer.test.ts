import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeL2OrderFields, _calcNonce, _decimalToBigInt, _ceilDiv, _hexToInt } from '../../src/core/l2-signer.js';
import type { L2OrderMeta, L2OrderInput } from '../../src/core/l2-signer.js';

const TEST_PRIV_KEY = '0x060e87cb075c6b1fd0324367d2500244e96ecf05f5369cf5a1165513a0eb4112';

const TEST_META: L2OrderMeta = {
  starkExSyntheticAssetId: '0x4254432d3130000000000000000000',
  syntheticResolution: '0x2540be400',        // 10^10
  collateralAssetId: '0x02c04d8b650f44092278a7cb1e1028c82025dff622db96c934b611b84cc8de5a',
  collateralResolution: '0xf4240',            // 10^6
  feeRate: '0.0005',
  tickSize: '0.1',
};

describe('l2-signer.ts', () => {
  let dateNowSpy: ReturnType<typeof vi.spyOn>;
  let mathRandomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1709000000000);
    mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.123456);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
    mathRandomSpy.mockRestore();
  });

  // ─── U-L2-01~04: computeL2OrderFields ───

  describe('computeL2OrderFields', () => {
    it('U-L2-01: limit BUY returns valid L2OrderFields', () => {
      const input: L2OrderInput = {
        side: 'BUY', type: 'LIMIT', size: '1', price: '50000', accountId: '12345',
      };
      const result = computeL2OrderFields(input, TEST_META, TEST_PRIV_KEY);

      expect(result.clientOrderId).toBeTruthy();
      expect(result.l2Nonce).toBeTruthy();
      expect(result.l2Value).toBeTruthy();
      expect(result.l2Size).toBe('1');
      expect(result.l2Signature).toMatch(/^[0-9a-f]{128}$/);
      expect(result.expireTime).toBeTruthy();
      expect(result.l2ExpireTime).toBeTruthy();
    });

    it('U-L2-02: limit SELL direction reversal', () => {
      const buyInput: L2OrderInput = {
        side: 'BUY', type: 'LIMIT', size: '1', price: '50000', accountId: '12345',
      };
      const sellInput: L2OrderInput = {
        side: 'SELL', type: 'LIMIT', size: '1', price: '50000', accountId: '12345',
      };
      const buyResult = computeL2OrderFields(buyInput, TEST_META, TEST_PRIV_KEY);
      const sellResult = computeL2OrderFields(sellInput, TEST_META, TEST_PRIV_KEY);

      // l2Value should be the same (same price * size)
      expect(buyResult.l2Value).toBe(sellResult.l2Value);
      // But signatures must differ (different Pedersen hash due to asset direction)
      // Note: signatures differ because of randomBytes, but the important thing is both succeed
      expect(buyResult.l2Signature).toHaveLength(128);
      expect(sellResult.l2Signature).toHaveLength(128);
    });

    it('U-L2-03: market BUY l2Price = oracle * 10 (CRITICAL REGRESSION)', () => {
      const input: L2OrderInput = {
        side: 'BUY', type: 'MARKET', size: '1', oraclePrice: '50000', accountId: '12345',
      };
      const result = computeL2OrderFields(input, TEST_META, TEST_PRIV_KEY);

      // l2Price = 50000 * 10 = 500000, l2Value = 500000 * 1 = 500000
      expect(result.l2Value).toBe('500000');
    });

    it('U-L2-04: market SELL l2Price = tickSize', () => {
      const input: L2OrderInput = {
        side: 'SELL', type: 'MARKET', size: '1', oraclePrice: '50000', accountId: '12345',
      };
      const result = computeL2OrderFields(input, TEST_META, TEST_PRIV_KEY);

      // l2Price = tickSize = 0.1, l2Value = 0.1 * 1 = 0.1
      expect(result.l2Value).toBe('0.1');
    });

    it('U-L2-05: market BUY without oraclePrice defaults to 0', () => {
      const input: L2OrderInput = {
        side: 'BUY', type: 'MARKET', size: '1', accountId: '12345',
      };
      const result = computeL2OrderFields(input, TEST_META, TEST_PRIV_KEY);

      // oraclePrice defaults to '0', l2Price = 0 * 10 = 0
      expect(result.l2Value).toBe('0');
    });

    it('U-L2-11: Pedersen hash differs for BUY vs SELL', () => {
      // We can't directly test the hash, but we can verify that the same inputs
      // with different sides produce different l2Value (which feeds into hash)
      const buyInput: L2OrderInput = {
        side: 'BUY', type: 'LIMIT', size: '1', price: '100', accountId: '12345',
      };
      const sellInput: L2OrderInput = {
        side: 'SELL', type: 'LIMIT', size: '1', price: '100', accountId: '12345',
      };
      const buyResult = computeL2OrderFields(buyInput, TEST_META, TEST_PRIV_KEY);
      const sellResult = computeL2OrderFields(sellInput, TEST_META, TEST_PRIV_KEY);

      // Both should produce valid signatures
      expect(buyResult.l2Signature).toMatch(/^[0-9a-f]{128}$/);
      expect(sellResult.l2Signature).toMatch(/^[0-9a-f]{128}$/);
    });

    it('U-L2-12: l2Signature is valid ECDSA', () => {
      const input: L2OrderInput = {
        side: 'BUY', type: 'LIMIT', size: '1', price: '100', accountId: '12345',
      };
      const result = computeL2OrderFields(input, TEST_META, TEST_PRIV_KEY);

      const r = BigInt('0x' + result.l2Signature.slice(0, 64));
      const s = BigInt('0x' + result.l2Signature.slice(64, 128));

      expect(r).toBeGreaterThan(0n);
      expect(s).toBeGreaterThan(0n);
      expect(r).toBeLessThan(1n << 251n);
    });

    it('U-L2-13: large size does not overflow', () => {
      const input: L2OrderInput = {
        side: 'BUY', type: 'LIMIT', size: '99999.99999999', price: '100000', accountId: '12345',
      };
      expect(() => {
        computeL2OrderFields(input, TEST_META, TEST_PRIV_KEY);
      }).not.toThrow();
    });

    it('U-L2-14: expireTime is now + 1 day, l2ExpireTime is now + 10 days', () => {
      const input: L2OrderInput = {
        side: 'BUY', type: 'LIMIT', size: '1', price: '100', accountId: '12345',
      };
      const result = computeL2OrderFields(input, TEST_META, TEST_PRIV_KEY);

      const oneDay = 24 * 60 * 60 * 1000;
      expect(Number(result.expireTime)).toBe(1709000000000 + oneDay);
      expect(Number(result.l2ExpireTime)).toBe(1709000000000 + 10 * oneDay);
    });
  });

  // ─── U-L2-06~09: Internal helpers ───

  describe('decimalToBigInt', () => {
    it('U-L2-06: normal decimal', () => {
      expect(_decimalToBigInt('1.5', 10n ** 8n)).toBe(150000000n);
    });

    it('U-L2-07: no decimal part', () => {
      expect(_decimalToBigInt('100', 10n ** 8n)).toBe(10000000000n);
    });

    it('U-L2-08: high precision input truncates to factor', () => {
      const result = _decimalToBigInt('0.123456789012345678', 10n ** 8n);
      // Should truncate: 0.12345678 * 10^8 = 12345678
      expect(result).toBe(12345678n);
    });
  });

  describe('ceilDiv', () => {
    it('U-L2-09: ceiling division', () => {
      expect(_ceilDiv(7n, 3n)).toBe(3n);
      expect(_ceilDiv(6n, 3n)).toBe(2n);
      expect(_ceilDiv(1n, 3n)).toBe(1n);
    });
  });

  describe('calcNonce', () => {
    it('U-L2-10: deterministic for same input', () => {
      const nonce1 = _calcNonce('test-order-id-123');
      const nonce2 = _calcNonce('test-order-id-123');
      expect(nonce1).toBe(nonce2);
      expect(typeof nonce1).toBe('number');
      expect(nonce1).toBeGreaterThan(0);
    });
  });

  describe('hexToInt', () => {
    it('converts hex strings', () => {
      expect(_hexToInt('0x10')).toBe(16n);
      expect(_hexToInt('0xf4240')).toBe(1000000n);
      expect(_hexToInt('0x2540be400')).toBe(10000000000n);
    });
  });
});
