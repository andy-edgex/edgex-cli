import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Mock fs modules before importing config
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  chmod: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

const CONFIG_DIR = join(homedir(), '.edgex');

describe('config.ts', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // Clean env vars
    delete process.env.EDGEX_TESTNET;
    delete process.env.EDGEX_ACCOUNT_ID;
    delete process.env.EDGEX_STARK_PRIVATE_KEY;
    delete process.env.EDGEX_BASE_URL;
    delete process.env.EDGEX_WS_URL;
    delete process.env.EDGEX_EDGE_CHAIN_RPC_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // ─── C-ISO-01~03: Path isolation ───

  it('C-ISO-01: mainnet config path', async () => {
    const { getConfigPath } = await import('../../src/core/config.js');
    expect(getConfigPath()).toBe(join(CONFIG_DIR, 'config.json'));
  });

  it('C-ISO-02: testnet config path', async () => {
    process.env.EDGEX_TESTNET = '1';
    const { getConfigPath } = await import('../../src/core/config.js');
    expect(getConfigPath()).toBe(join(CONFIG_DIR, 'config-testnet.json'));
  });

  it('C-ISO-03: contracts cache isolation', async () => {
    // Mainnet
    delete process.env.EDGEX_TESTNET;
    const mainnetMod = await import('../../src/core/config.js');
    const mainnetCache = mainnetMod.getContractsCacheFile();
    expect(mainnetCache).toBe(join(CONFIG_DIR, 'contracts.json'));
  });

  // ─── C-ISO-04: Env overrides file config ───

  it('C-ISO-04: env vars override file config', async () => {
    const fsMock = await import('node:fs/promises');
    (fsMock.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      JSON.stringify({ accountId: 'from-file', baseUrl: 'https://file.example.com' })
    );

    process.env.EDGEX_ACCOUNT_ID = 'from-env';

    const { loadConfig } = await import('../../src/core/config.js');
    const config = await loadConfig();

    expect(config.accountId).toBe('from-env');
  });

  // ─── C-ISO-05: isTestnet ───

  it('C-ISO-05: isTestnet checks env', async () => {
    const { isTestnet } = await import('../../src/core/config.js');

    delete process.env.EDGEX_TESTNET;
    expect(isTestnet()).toBe(false);

    process.env.EDGEX_TESTNET = '1';
    expect(isTestnet()).toBe(true);

    process.env.EDGEX_TESTNET = 'true';
    expect(isTestnet()).toBe(true);

    process.env.EDGEX_TESTNET = 'false';
    expect(isTestnet()).toBe(false);
  });

  // ─── C-ISO-06: ensureConfigDir chmod 700 ───

  it('C-ISO-06: ensureConfigDir creates dir with 0o700', async () => {
    const fs = await import('node:fs');
    const fsp = await import('node:fs/promises');
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (fsp.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (fsp.chmod as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { ensureConfigDir } = await import('../../src/core/config.js');
    await ensureConfigDir();

    expect(fsp.mkdir).toHaveBeenCalledWith(CONFIG_DIR, { recursive: true, mode: 0o700 });
    expect(fsp.chmod).toHaveBeenCalledWith(CONFIG_DIR, 0o700);
  });

  // ─── C-ISO-07: saveConfig chmod 600 ───

  it('C-ISO-07: saveConfig writes file with mode 0o600', async () => {
    const fs = await import('node:fs');
    const fsp = await import('node:fs/promises');
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fsp.readFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'));
    (fsp.writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (fsp.chmod as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { saveConfig } = await import('../../src/core/config.js');
    await saveConfig({ accountId: 'test-123' });

    expect(fsp.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('config'),
      expect.stringContaining('test-123'),
      expect.objectContaining({ mode: 0o600 }),
    );
    expect(fsp.chmod).toHaveBeenCalledWith(expect.stringContaining('config'), 0o600);
  });

  // ─── C-ISO-09~11: Cache behavior ───

  it('C-ISO-09: expired cache returns null', async () => {
    const fs = await import('node:fs');
    const fsp = await import('node:fs/promises');
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    (fsp.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      JSON.stringify({ timestamp: twoHoursAgo, contracts: [{ contractId: '1' }] })
    );

    const { loadCachedContracts } = await import('../../src/core/symbols.js');
    const result = await loadCachedContracts();
    expect(result).toBeNull();
  });

  it('C-ISO-10: valid cache returns data', async () => {
    const fs = await import('node:fs');
    const fsp = await import('node:fs/promises');
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
    const mockContracts = [{ contractId: '10001', contractName: 'BTCUSD' }];
    (fsp.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      JSON.stringify({ timestamp: thirtyMinAgo, contracts: mockContracts })
    );

    const { loadCachedContracts } = await import('../../src/core/symbols.js');
    const result = await loadCachedContracts();
    expect(result).not.toBeNull();
    expect(result![0].contractId).toBe('10001');
  });

  it('C-ISO-11: corrupt cache returns null', async () => {
    const fs = await import('node:fs');
    const fsp = await import('node:fs/promises');
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fsp.readFile as ReturnType<typeof vi.fn>).mockResolvedValue('not valid json {{{');

    const { loadCachedContracts } = await import('../../src/core/symbols.js');
    const result = await loadCachedContracts();
    expect(result).toBeNull();
  });
});
