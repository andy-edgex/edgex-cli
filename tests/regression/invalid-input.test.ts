import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signRequest } from '../../src/core/auth.js';
import { _decimalToBigInt } from '../../src/core/l2-signer.js';
import { buildOrderPayload } from '../../src/core/order-service.js';
import type { ContractMeta, CoinMeta } from '../../src/core/types.js';
import contracts from '../fixtures/contracts.json' with { type: 'json' };
import coins from '../fixtures/coins.json' with { type: 'json' };

const testContracts = contracts as unknown as ContractMeta[];
const testCoins = coins as unknown as CoinMeta[];
const btcContract = testContracts[0]!;
const TEST_PRIV_KEY = '0x060e87cb075c6b1fd0324367d2500244e96ecf05f5369cf5a1165513a0eb4112';

describe('invalid input defense', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1709000000000);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── B-INV-05: empty starkPrivateKey ───

  it('B-INV-05: empty starkPrivateKey throws', () => {
    expect(() => signRequest('GET', '/test', '')).toThrow();
  });

  // ─── B-INV-06: non-hex starkPrivateKey ───

  it('B-INV-06: non-hex starkPrivateKey throws', () => {
    expect(() => signRequest('GET', '/test', 'not-a-hex-key')).toThrow();
  });

  // ─── B-INV-01: NaN size ───

  it('B-INV-01: NaN size in order', () => {
    // decimalToBigInt with NaN input — should throw or produce 0
    expect(() => _decimalToBigInt('abc', 10n ** 8n)).toThrow();
  });

  // ─── B-INV-02: negative price ───

  it('B-INV-02: negative price throws in Pedersen hash', () => {
    // Negative price produces negative bigint → Pedersen rejects with PedersenArg error
    expect(() => buildOrderPayload({
      contract: btcContract, coins: testCoins, starkPrivateKey: TEST_PRIV_KEY,
      accountId: '12345', side: 'BUY', type: 'LIMIT', size: '1', price: '-100',
    })).toThrow();
  });

  // ─── B-INV-03: negative size ───

  it('B-INV-03: negative size throws in Pedersen hash', () => {
    // Negative size produces negative bigint → Pedersen rejects
    expect(() => buildOrderPayload({
      contract: btcContract, coins: testCoins, starkPrivateKey: TEST_PRIV_KEY,
      accountId: '12345', side: 'BUY', type: 'LIMIT', size: '-1', price: '50000',
    })).toThrow();
  });

  // ─── B-INV-04: zero price for limit order ───

  it('B-INV-04: zero price for limit order', () => {
    const result = buildOrderPayload({
      contract: btcContract, coins: testCoins, starkPrivateKey: TEST_PRIV_KEY,
      accountId: '12345', side: 'BUY', type: 'LIMIT', size: '1', price: '0',
    });
    expect(result.orderPrice).toBe('0');
  });
});
