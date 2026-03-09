import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeL2OrderFields, _decimalToBigInt, _hexToInt } from '../../src/core/l2-signer.js';
import type { L2OrderMeta, L2OrderInput } from '../../src/core/l2-signer.js';

const TEST_PRIV_KEY = '0x060e87cb075c6b1fd0324367d2500244e96ecf05f5369cf5a1165513a0eb4112';

const TEST_META: L2OrderMeta = {
  starkExSyntheticAssetId: '0x4254432d3130000000000000000000',
  syntheticResolution: '0x2540be400',
  collateralAssetId: '0x02c04d8b650f44092278a7cb1e1028c82025dff622db96c934b611b84cc8de5a',
  collateralResolution: '0xf4240',
  feeRate: '0.0005',
  tickSize: '0.1',
};

describe('big number precision', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1709000000000);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── B-BIG-01: large size * price ───

  it('B-BIG-01: BTC full size=100, price=100000 does not overflow', () => {
    const input: L2OrderInput = {
      side: 'BUY', type: 'LIMIT', size: '100', price: '100000', accountId: '12345',
    };
    expect(() => computeL2OrderFields(input, TEST_META, TEST_PRIV_KEY)).not.toThrow();

    const result = computeL2OrderFields(input, TEST_META, TEST_PRIV_KEY);
    expect(result.l2Signature).toMatch(/^[0-9a-f]{128}$/);
  });

  // ─── B-BIG-02: very small size ───

  it('B-BIG-02: tiny size=0.001 scales correctly', () => {
    const result = _decimalToBigInt('0.001', 10n ** 10n);
    expect(result).toBe(10000000n);  // 0.001 * 10^10 = 10^7
  });

  // ─── B-BIG-03: high precision price ───

  it('B-BIG-03: high precision price=0.00001234', () => {
    const result = _decimalToBigInt('0.00001234', 10n ** 8n);
    expect(result).toBe(1234n);  // 0.00001234 * 10^8 = 1234
  });

  // ─── B-BIG-04: real account ID as BigInt ───

  it('B-BIG-04: real accountId as BigInt', () => {
    const id = '723165789812687327';
    const input: L2OrderInput = {
      side: 'BUY', type: 'LIMIT', size: '1', price: '100', accountId: id,
    };
    expect(() => computeL2OrderFields(input, TEST_META, TEST_PRIV_KEY)).not.toThrow();

    // Verify BigInt conversion
    expect(BigInt(id)).toBe(723165789812687327n);
  });

  // ─── B-BIG-05: large hex resolution ───

  it('B-BIG-05: large starkExResolution hex', () => {
    const result = _hexToInt('0x1000000000000000000');
    expect(result).toBe(0x1000000000000000000n);
    expect(result).toBeGreaterThan(0n);
  });
});
