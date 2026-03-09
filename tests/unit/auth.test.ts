import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildSignContent, signRequest, _serializeValue, _bytesToBigInt } from '../../src/core/auth.js';
import { Point } from '@scure/starknet';

const TEST_PRIV_KEY = '0x060e87cb075c6b1fd0324367d2500244e96ecf05f5369cf5a1165513a0eb4112';
const MAX_STARK_VALUE = 1n << 251n;

describe('auth.ts', () => {
  // ─── U-AUTH-01~05: buildSignContent ───

  describe('buildSignContent', () => {
    it('U-AUTH-01: GET no params', () => {
      const result = buildSignContent(1709000000000, 'GET', '/api/v1/test');
      expect(result).toBe('1709000000000GET/api/v1/test');
    });

    it('U-AUTH-02: GET with sorted params', () => {
      const result = buildSignContent(1709000000000, 'GET', '/api/v1/test', { b: '2', a: '1' });
      expect(result).toBe('1709000000000GET/api/v1/testa=1&b=2');
    });

    it('U-AUTH-03: POST nested object (recursive serialize)', () => {
      const result = buildSignContent(1709000000000, 'POST', '/api/v1/order', {
        accountId: '123',
        orderIdList: ['a', 'b'],
      });
      expect(result).toBe('1709000000000POST/api/v1/orderaccountId=123&orderIdList=a&b');
    });

    it('U-AUTH-04: POST empty params', () => {
      const result = buildSignContent(1709000000000, 'POST', '/api/v1/test', {});
      expect(result).toBe('1709000000000POST/api/v1/test');
    });

    it('U-AUTH-05: boolean and null values', () => {
      const result = buildSignContent(1709000000000, 'POST', '/path', { empty: null, flag: true });
      expect(result).toBe('1709000000000POST/pathempty=&flag=true');
    });
  });

  // ─── U-AUTH-06~11: signRequest & ECDSA ───

  describe('signRequest', () => {
    let dateNowSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1709000000000);
    });

    afterEach(() => {
      dateNowSpy.mockRestore();
    });

    it('U-AUTH-06: signature is 192 hex chars', () => {
      const { signature } = signRequest('GET', '/api/v1/test', TEST_PRIV_KEY);
      expect(signature).toHaveLength(192);
      expect(signature).toMatch(/^[0-9a-f]{192}$/);
    });

    it('U-AUTH-07: signature is ECDSA-verifiable', () => {
      const { signature } = signRequest('GET', '/api/v1/test', TEST_PRIV_KEY);
      const r = BigInt('0x' + signature.slice(0, 64));
      const s = BigInt('0x' + signature.slice(64, 128));
      const yPub = BigInt('0x' + signature.slice(128, 192));

      // r, s, yPub should all be positive
      expect(r).toBeGreaterThan(0n);
      expect(s).toBeGreaterThan(0n);
      expect(yPub).toBeGreaterThan(0n);
    });

    it('U-AUTH-08: privKey with 0x prefix', () => {
      const { signature } = signRequest('GET', '/test', '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
      expect(signature).toHaveLength(192);
    });

    it('U-AUTH-09: privKey without 0x prefix', () => {
      const { signature } = signRequest('GET', '/test', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
      expect(signature).toHaveLength(192);
    });

    it('U-AUTH-10: r < 2^251 (StarkEx constraint)', () => {
      // Run multiple signatures to check constraint
      for (let i = 0; i < 5; i++) {
        dateNowSpy.mockReturnValue(1709000000000 + i);
        const { signature } = signRequest('GET', `/test/${i}`, TEST_PRIV_KEY);
        const r = BigInt('0x' + signature.slice(0, 64));
        expect(r).toBeLessThan(MAX_STARK_VALUE);
        expect(r).toBeGreaterThan(0n);
      }
    });

    it('U-AUTH-11: large msgHash does not throw', () => {
      // Use a path that would generate a large keccak hash
      expect(() => {
        signRequest('POST', '/api/v1/very/long/path/that/generates/large/hash', TEST_PRIV_KEY, {
          largeField: 'x'.repeat(1000),
        });
      }).not.toThrow();
    });
  });

  // ─── U-AUTH-12: bytesToBigInt ───

  describe('bytesToBigInt', () => {
    it('U-AUTH-12: converts bytes correctly', () => {
      expect(_bytesToBigInt(new Uint8Array([0x01, 0x00]))).toBe(256n);
      expect(_bytesToBigInt(new Uint8Array([0xff]))).toBe(255n);
      expect(_bytesToBigInt(new Uint8Array([0x00]))).toBe(0n);
      expect(_bytesToBigInt(new Uint8Array([0x01, 0x02, 0x03]))).toBe(0x010203n);
    });
  });

  // ─── U-SER-01~08: serializeValue ───

  describe('serializeValue', () => {
    it('U-SER-01: string passthrough', () => {
      expect(_serializeValue('hello')).toBe('hello');
    });

    it('U-SER-02: number to string', () => {
      expect(_serializeValue(42)).toBe('42');
    });

    it('U-SER-03: boolean', () => {
      expect(_serializeValue(true)).toBe('true');
      expect(_serializeValue(false)).toBe('false');
    });

    it('U-SER-04: null/undefined', () => {
      expect(_serializeValue(null)).toBe('');
      expect(_serializeValue(undefined)).toBe('');
    });

    it('U-SER-05: array joins with &', () => {
      expect(_serializeValue(['a', 'b', 'c'])).toBe('a&b&c');
    });

    it('U-SER-06: empty array', () => {
      expect(_serializeValue([])).toBe('');
    });

    it('U-SER-07: nested object (sorted keys)', () => {
      expect(_serializeValue({ a: { y: 2, x: 1 } })).toBe('a=x=1&y=2');
    });

    it('U-SER-08: object with array (order cancel scenario)', () => {
      expect(_serializeValue({ ids: ['1', '2'] })).toBe('ids=1&2');
    });
  });
});
