import { Command } from 'commander';
import chalk from 'chalk';
import type { ContractMeta, OutputFormat } from '../core/types.js';
import { KLINE_INTERVALS } from '../core/types.js';
import { EdgexClient } from '../core/client.js';
import { EdgexWebSocket } from '../core/ws.js';
import { loadConfig, loadConfigSync } from '../core/config.js';
import { signRequest } from '../core/auth.js';
import { loadCachedContracts, saveCachedContracts, resolveSymbol } from '../core/symbols.js';
import { handleError, EdgexError } from '../utils/errors.js';

let contracts: ContractMeta[];

function getFormat(cmd: Command): OutputFormat {
  return cmd.optsWithGlobals().json ? 'json' : 'human';
}

async function initContracts(): Promise<void> {
  const config = await loadConfig();
  const client = new EdgexClient(config);

  const cached = await loadCachedContracts();
  if (cached) {
    contracts = cached;
  } else {
    const meta = await client.getMetaData();
    contracts = meta.contractList;
    await saveCachedContracts(contracts, meta.coinList);
  }
}

function requireSymbol(symbol: string): ContractMeta {
  const contract = resolveSymbol(contracts, symbol);
  if (!contract) throw new EdgexError(`Unknown symbol: ${symbol}`);
  return contract;
}

function ndjson(data: unknown): void {
  console.log(JSON.stringify(data));
}

function connectPublic(channels: string[]): void {
  const config = loadConfigSync();
  const wsUrl = config.wsUrl;

  const ws = new EdgexWebSocket({
    url: `${wsUrl}/api/v1/public/ws`,
    channels,
    onMessage: (_channel, data) => ndjson(data),
    onError: (err) => process.stderr.write(chalk.red(`Error: ${err.message}\n`)),
    onClose: () => process.exit(0),
  });

  ws.connect();

  process.on('SIGINT', () => {
    process.stderr.write(chalk.gray('\nClosing...\n'));
    ws.close();
    process.exit(0);
  });
}

async function connectPrivate(): Promise<void> {
  const config = await loadConfig();
  if (!config.accountId || !config.starkPrivateKey) {
    throw new EdgexError('Authentication required. Run "edgex setup" first.');
  }

  const wsUrl = config.wsUrl;
  const path = `/api/v1/private/ws`;

  const { timestamp, signature } = signRequest(
    'GET',
    path,
    config.starkPrivateKey,
    { accountId: config.accountId },
  );

  const ws = new EdgexWebSocket({
    url: `${wsUrl}${path}?accountId=${config.accountId}`,
    channels: [],
    headers: {
      'X-edgeX-Api-Timestamp': timestamp,
      'X-edgeX-Api-Signature': signature,
    },
    onMessage: (_channel, data) => ndjson(data),
    onError: (err) => process.stderr.write(chalk.red(`Error: ${err.message}\n`)),
    onClose: () => process.exit(0),
  });

  ws.connect();

  process.on('SIGINT', () => {
    process.stderr.write(chalk.gray('\nClosing...\n'));
    ws.close();
    process.exit(0);
  });
}

export function registerStreamCommand(program: Command): void {
  const stream = program
    .command('stream')
    .description('Real-time WebSocket data streams (NDJSON output)');

  // ─── ticker ───

  stream
    .command('ticker <symbol>')
    .description('Stream real-time ticker updates')
    .action(async (symbol: string, _opts: unknown, cmd: Command) => {
      try {
        await initContracts();
        const contract = requireSymbol(symbol);
        process.stderr.write(chalk.gray(`Streaming ticker for ${contract.contractName}... (Ctrl+C to stop)\n`));
        connectPublic([`ticker.${contract.contractId}`]);
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── depth ───

  stream
    .command('depth <symbol>')
    .description('Stream real-time order book')
    .option('-l, --level <level>', 'Depth levels: 15 or 200', '15')
    .action(async (symbol: string, opts: { level: string }, cmd: Command) => {
      try {
        await initContracts();
        const contract = requireSymbol(symbol);
        process.stderr.write(chalk.gray(`Streaming depth for ${contract.contractName}... (Ctrl+C to stop)\n`));
        connectPublic([`depth.${contract.contractId}.${opts.level}`]);
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── kline ───

  stream
    .command('kline <symbol>')
    .description('Stream real-time kline updates')
    .option('-i, --interval <interval>', 'Interval: 1m/5m/15m/1h/4h/1d', '1m')
    .action(async (symbol: string, opts: { interval: string }, cmd: Command) => {
      try {
        await initContracts();
        const contract = requireSymbol(symbol);
        const klineType = KLINE_INTERVALS[opts.interval];
        if (!klineType) throw new EdgexError(`Invalid interval: ${opts.interval}`);
        process.stderr.write(chalk.gray(`Streaming kline for ${contract.contractName} (${opts.interval})... (Ctrl+C to stop)\n`));
        connectPublic([`kline.LAST_PRICE.${contract.contractId}.${klineType}`]);
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── trades ───

  stream
    .command('trades <symbol>')
    .description('Stream real-time trades')
    .action(async (symbol: string, _opts: unknown, cmd: Command) => {
      try {
        await initContracts();
        const contract = requireSymbol(symbol);
        process.stderr.write(chalk.gray(`Streaming trades for ${contract.contractName}... (Ctrl+C to stop)\n`));
        connectPublic([`trades.${contract.contractId}`]);
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── account ───

  stream
    .command('account')
    .description('Stream account/order/position updates (requires auth)')
    .action(async (_opts: unknown, cmd: Command) => {
      try {
        process.stderr.write(chalk.gray('Streaming account updates... (Ctrl+C to stop)\n'));
        await connectPrivate();
      } catch (err) { handleError(err, getFormat(cmd)); }
    });
}
