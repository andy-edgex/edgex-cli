import { describe, it, expect, vi, afterEach } from 'vitest';
import { EdgexError, ApiError, ConfigError, handleError } from '../../src/utils/errors.js';

describe('errors.ts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Error hierarchy ───

  it('ApiError extends EdgexError', () => {
    const err = new ApiError('400', 'bad request');
    expect(err).toBeInstanceOf(EdgexError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('400');
  });

  it('ConfigError extends EdgexError', () => {
    const err = new ConfigError('missing config');
    expect(err).toBeInstanceOf(EdgexError);
    expect(err.message).toBe('missing config');
  });

  // ─── U-ERR-01: handleError with ApiError ───

  it('U-ERR-01: handleError with ApiError exits with code 1', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as any);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => handleError(new ApiError('400', 'bad request'))).toThrow('process.exit');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleSpy).toHaveBeenCalled();
  });

  // ─── U-ERR-02: handleError with plain Error ───

  it('U-ERR-02: handleError with plain Error', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as any);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => handleError(new Error('something broke'))).toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // ─── U-ERR-03: handleError with non-Error ───

  it('U-ERR-03: handleError with string', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as any);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => handleError('string error')).toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // ─── handleError JSON format ───

  it('handleError JSON format outputs JSON', () => {
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as any);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => handleError(new ApiError('ERR_123', 'test error'), 'json')).toThrow('process.exit');

    const jsonOutput = logSpy.mock.calls[0]?.[0];
    if (jsonOutput) {
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('test error');
    }
  });
});
