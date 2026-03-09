import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildOrderPayload, getL2Meta } from '../../src/core/order-service.js';
import type { ContractMeta, CoinMeta } from '../../src/core/types.js';
import contracts from '../fixtures/contracts.json' with { type: 'json' };
import coins from '../fixtures/coins.json' with { type: 'json' };

const testContracts = contracts as unknown as ContractMeta[];
const testCoins = coins as unknown as CoinMeta[];
const btcContract = testContracts[0]!;

const TEST_PRIV_KEY = '0x060e87cb075c6b1fd0324367d2500244e96ecf05f5369cf5a1165513a0eb4112';

describe('order-service.ts', () => {
  let dateNowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1709000000000);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── B-MKT-01~06: Market order price regression ───

  describe('market order price (regression)', () => {
    it('B-MKT-01: market BUY displayPrice = ceil(oracle * 1.1)', () => {
      const result = buildOrderPayload({
        contract: btcContract, coins: testCoins, starkPrivateKey: TEST_PRIV_KEY,
        accountId: '12345', side: 'BUY', type: 'MARKET', size: '1', oraclePrice: '50000',
      });
      // Math.ceil(50000 * 1.1 * 100) / 100 = 55000.01 due to floating point
      expect(result.displayPrice).toBe(String(Math.ceil(50000 * 1.1 * 100) / 100));
    });

    it('B-MKT-02: market SELL displayPrice = floor(oracle * 0.9)', () => {
      const result = buildOrderPayload({
        contract: btcContract, coins: testCoins, starkPrivateKey: TEST_PRIV_KEY,
        accountId: '12345', side: 'SELL', type: 'MARKET', size: '1', oraclePrice: '50000',
      });
      expect(result.displayPrice).toBe('45000');
    });

    it('B-MKT-03: oracle decimal precision', () => {
      const result = buildOrderPayload({
        contract: btcContract, coins: testCoins, starkPrivateKey: TEST_PRIV_KEY,
        accountId: '12345', side: 'BUY', type: 'MARKET', size: '1', oraclePrice: '137.456',
      });
      // ceil(137.456 * 1.1 * 100) / 100 = ceil(15120.16) / 100 = 15121/100 = 151.21
      expect(result.displayPrice).toBe('151.21');
    });

    it('B-MKT-04: oracle = 0', () => {
      const result = buildOrderPayload({
        contract: btcContract, coins: testCoins, starkPrivateKey: TEST_PRIV_KEY,
        accountId: '12345', side: 'BUY', type: 'MARKET', size: '1', oraclePrice: '0',
      });
      expect(result.displayPrice).toBe('0');
    });

    it('B-MKT-05: market orderPrice is always "0"', () => {
      const result = buildOrderPayload({
        contract: btcContract, coins: testCoins, starkPrivateKey: TEST_PRIV_KEY,
        accountId: '12345', side: 'BUY', type: 'MARKET', size: '1', oraclePrice: '50000',
      });
      expect(result.orderPrice).toBe('0');
      expect(result.orderBody.price).toBe('0');
    });

    it('B-MKT-06: timeInForce correct for MARKET vs LIMIT', () => {
      const marketResult = buildOrderPayload({
        contract: btcContract, coins: testCoins, starkPrivateKey: TEST_PRIV_KEY,
        accountId: '12345', side: 'BUY', type: 'MARKET', size: '1', oraclePrice: '50000',
      });
      expect(marketResult.orderBody.timeInForce).toBe('IMMEDIATE_OR_CANCEL');

      const limitResult = buildOrderPayload({
        contract: btcContract, coins: testCoins, starkPrivateKey: TEST_PRIV_KEY,
        accountId: '12345', side: 'BUY', type: 'LIMIT', size: '1', price: '50000',
      });
      expect(limitResult.orderBody.timeInForce).toBe('GOOD_TIL_CANCEL');
    });
  });

  // ─── B-MKT supplemental: TP/SL ───

  describe('TP/SL order logic', () => {
    it('TP generates opposite side MARKET order', () => {
      const result = buildOrderPayload({
        contract: btcContract, coins: testCoins, starkPrivateKey: TEST_PRIV_KEY,
        accountId: '12345', side: 'BUY', type: 'LIMIT', size: '1', price: '50000',
        tp: '55000',
      });
      expect(result.orderBody.isSetOpenTp).toBe(true);
      expect((result.orderBody.openTp as any).side).toBe('SELL');
      expect((result.orderBody.openTp as any).triggerPrice).toBe('55000');
    });

    it('SL generates opposite side MARKET order', () => {
      const result = buildOrderPayload({
        contract: btcContract, coins: testCoins, starkPrivateKey: TEST_PRIV_KEY,
        accountId: '12345', side: 'BUY', type: 'LIMIT', size: '1', price: '50000',
        sl: '48000',
      });
      expect(result.orderBody.isSetOpenSl).toBe(true);
      expect((result.orderBody.openSl as any).side).toBe('SELL');
      expect((result.orderBody.openSl as any).triggerPrice).toBe('48000');
    });
  });

  // ─── E-ORD-01: limit without price ───

  it('E-ORD-01: LIMIT order without price throws', () => {
    expect(() => {
      buildOrderPayload({
        contract: btcContract, coins: testCoins, starkPrivateKey: TEST_PRIV_KEY,
        accountId: '12345', side: 'BUY', type: 'LIMIT', size: '1',
      });
    }).toThrow('--price is required');
  });

  // ─── B-INV-07~08: Missing metadata ───

  describe('getL2Meta validation', () => {
    it('B-INV-07: missing StarkEx metadata throws', () => {
      const badContract = { ...btcContract, starkExSyntheticAssetId: undefined };
      expect(() => getL2Meta(badContract as any, testCoins)).toThrow('Missing StarkEx metadata');
    });

    it('B-INV-08: missing quote coin metadata throws', () => {
      const badCoins = [{ coinId: '1000', coinName: 'USDC', stepSize: '0.01' }];
      expect(() => getL2Meta(btcContract, badCoins as CoinMeta[])).toThrow('Missing StarkEx metadata for quote coin');
    });
  });
});
