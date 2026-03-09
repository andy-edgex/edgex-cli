import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatPnl, formatPercent, formatPrice, output, printJson } from '../../src/utils/output.js';

describe('output.ts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── U-OUT-01: formatPnl positive ───

  it('U-OUT-01: formatPnl positive shows green +', () => {
    const result = formatPnl('123.45');
    expect(result).toContain('+123.45');
  });

  // ─── U-OUT-02: formatPnl negative ───

  it('U-OUT-02: formatPnl negative shows red', () => {
    const result = formatPnl('-50.0');
    expect(result).toContain('-50.0');
  });

  // ─── U-OUT-03: formatPnl NaN ───

  it('U-OUT-03: formatPnl NaN returns original', () => {
    expect(formatPnl('abc')).toBe('abc');
  });

  // ─── U-OUT-04: formatPercent ───

  it('U-OUT-04: formatPercent 0.05 → +5.00%', () => {
    const result = formatPercent('0.05');
    expect(result).toContain('+5.00%');
  });

  it('formatPercent negative', () => {
    const result = formatPercent('-0.02');
    expect(result).toContain('-2.00%');
  });

  // ─── U-OUT-05: output json mode ───

  it('U-OUT-05: output json mode calls printJson', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const data = { test: 123 };

    output('json', data, () => { throw new Error('should not call human'); });

    expect(logSpy).toHaveBeenCalled();
    const arg = logSpy.mock.calls[0]?.[0];
    expect(JSON.parse(arg)).toEqual(data);
  });

  // ─── U-OUT-06: output human mode ───

  it('U-OUT-06: output human mode calls humanFn', () => {
    const humanFn = vi.fn();
    output('human', { unused: true }, humanFn);
    expect(humanFn).toHaveBeenCalledOnce();
  });

  // ─── formatPrice ───

  it('formatPrice formats number to fixed(2)', () => {
    expect(formatPrice(123.456)).toBe('123.46');
  });

  it('formatPrice string passthrough', () => {
    expect(formatPrice('50000.00')).toBe('50000.00');
  });
});
