import { describe, it, expect } from 'vitest';
import { resolveSymbol, findCoin, formatSymbolName } from '../../src/core/symbols.js';
import type { ContractMeta, CoinMeta } from '../../src/core/types.js';
import contracts from '../fixtures/contracts.json' with { type: 'json' };
import coins from '../fixtures/coins.json' with { type: 'json' };

const testContracts = contracts as unknown as ContractMeta[];
const testCoins = coins as unknown as CoinMeta[];

describe('symbols.ts', () => {
  // ─── U-SYM-01~08: resolveSymbol ───

  describe('resolveSymbol', () => {
    it('U-SYM-01: exact match', () => {
      const result = resolveSymbol(testContracts, 'BTCUSD');
      expect(result).not.toBeNull();
      expect(result!.contractName).toBe('BTCUSD');
    });

    it('U-SYM-02: auto-complete USD suffix', () => {
      const result = resolveSymbol(testContracts, 'BTC');
      expect(result).not.toBeNull();
      expect(result!.contractName).toBe('BTCUSD');
    });

    it('U-SYM-03: auto-complete USDT suffix', () => {
      const result = resolveSymbol(testContracts, 'ETH');
      expect(result).not.toBeNull();
      // Should match ETHUSDT (trying USD first fails, then USDT succeeds)
      expect(result!.contractName).toBe('ETHUSDT');
    });

    it('U-SYM-04: case insensitive', () => {
      const lower = resolveSymbol(testContracts, 'btc');
      const mixed = resolveSymbol(testContracts, 'Btc');
      expect(lower).not.toBeNull();
      expect(mixed).not.toBeNull();
      expect(lower!.contractId).toBe(mixed!.contractId);
    });

    it('U-SYM-05: match by contractId', () => {
      const result = resolveSymbol(testContracts, '10001');
      expect(result).not.toBeNull();
      expect(result!.contractName).toBe('BTCUSD');
    });

    it('U-SYM-06: prefix match', () => {
      const result = resolveSymbol(testContracts, 'SOL');
      expect(result).not.toBeNull();
      expect(result!.contractName).toBe('SOLUSD');
    });

    it('U-SYM-07: no match returns null', () => {
      expect(resolveSymbol(testContracts, 'XXXYYY')).toBeNull();
    });

    it('U-SYM-08: empty string', () => {
      // Empty string normalized to '' — may prefix-match first contract
      const result = resolveSymbol(testContracts, '');
      // Behavior: '' uppercased is '', startsWith('') is always true → returns first contract
      expect(result).not.toBeNull();
    });
  });

  // ─── U-SYM-09~10: findCoin ───

  describe('findCoin', () => {
    it('U-SYM-09: finds coin by id', () => {
      const result = findCoin(testCoins, '1000');
      expect(result).not.toBeNull();
      expect(result!.coinName).toBe('USDC');
    });

    it('U-SYM-10: returns null for unknown coinId', () => {
      expect(findCoin(testCoins, '9999')).toBeNull();
    });
  });

  // ─── formatSymbolName ───

  describe('formatSymbolName', () => {
    it('returns contractName if available', () => {
      expect(formatSymbolName(testContracts[0]!)).toBe('BTCUSD');
    });

    it('falls back to contractId', () => {
      const noName = { ...testContracts[0]!, contractName: undefined as any };
      expect(formatSymbolName(noName)).toBe('10001');
    });
  });
});
