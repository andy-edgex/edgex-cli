import { describe, it, expect } from 'vitest';
import { runCli } from '../helpers/exec-cli.js';

describe('CLI smoke tests', () => {
  // ─── E-GLO-01: --version ───

  it('E-GLO-01: --version outputs version string', async () => {
    const result = await runCli(['--version']);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    expect(result.exitCode).toBe(0);
  });

  // ─── E-GLO-02: --help shows all commands ───

  it('E-GLO-02: --help lists major commands', async () => {
    const result = await runCli(['--help']);
    const output = result.stdout;

    expect(output).toContain('market');
    expect(output).toContain('account');
    expect(output).toContain('order');
    expect(output).toContain('setup');
    expect(result.exitCode).toBe(0);
  });

  // ─── E-GLO-05: unknown command ───

  it('E-GLO-05: unknown command exits with error', async () => {
    const result = await runCli(['foobar']);
    expect(result.exitCode).not.toBe(0);
  });
});
