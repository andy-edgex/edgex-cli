import { Command } from 'commander';
import chalk from 'chalk';
import type { OutputFormat, ContractMeta } from '../core/types.js';
import { EdgexClient } from '../core/client.js';
import { loadConfig } from '../core/config.js';
import { loadCachedContracts, saveCachedContracts, resolveSymbol } from '../core/symbols.js';
import { output, printTable, printKeyValue, formatPnl } from '../utils/output.js';
import { handleError, EdgexError } from '../utils/errors.js';

let client: EdgexClient;
let contracts: ContractMeta[];

async function init(): Promise<void> {
  const config = await loadConfig();
  client = new EdgexClient(config);

  const cached = await loadCachedContracts();
  if (cached) {
    contracts = cached;
  } else {
    const meta = await client.getMetaData();
    contracts = meta.contractList;
    await saveCachedContracts(contracts, meta.coinList);
  }
}

function getFormat(cmd: Command): OutputFormat {
  return cmd.optsWithGlobals().json ? 'json' : 'human';
}

function contractName(contractId: string): string {
  const c = contracts.find(ct => ct.contractId === contractId);
  return c?.contractName ?? contractId;
}

export function registerAccountCommand(program: Command): void {
  const account = program
    .command('account')
    .description('Account info (requires authentication)');

  // ─── balances ───

  account
    .command('balances')
    .description('Account asset balances')
    .action(async (_opts: unknown, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const data = await client.getAccountAsset();

        output(fmt, data, () => {
          console.log(chalk.bold('Account Balances\n'));
          const d = data as unknown as Record<string, unknown>;
          printKeyValue([
            ['Account ID', String(d.accountId ?? '')],
            ['Total Equity', String(d.totalEquity ?? d.totalCollateralValue ?? '')],
            ['Available Balance', String(d.availableBalance ?? d.totalMaxWithdrawAmount ?? '')],
            ['Initial Margin', String(d.initialMargin ?? d.totalInitialMarginRequirement ?? '')],
            ['Maintenance Margin', String(d.maintenanceMargin ?? d.totalMaintenanceMarginRequirement ?? '')],
            ['Unrealized PnL', formatPnl(String(d.unrealizedPnl ?? d.totalUnrealizedPnl ?? '0'))],
          ]);
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── positions ───

  account
    .command('positions')
    .description('Open positions')
    .action(async (_opts: unknown, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const data = await client.getAccountAsset();
        const raw = data as unknown as Record<string, unknown>;
        const positions = (raw.positionList ?? raw.positions ?? []) as Record<string, unknown>[];

        output(fmt, positions, () => {
          if (positions.length === 0) {
            console.log(chalk.gray('No open positions'));
            return;
          }
          printTable(
            ['Symbol', 'Side', 'Size', 'Entry Price', 'Mark Price', 'Unrealized PnL', 'Leverage'],
            positions.map(p => [
              contractName(String(p.contractId ?? '')),
              String(p.side ?? ''),
              String(p.size ?? p.openSize ?? ''),
              String(p.entryPrice ?? p.avgEntryPrice ?? ''),
              String(p.markPrice ?? ''),
              formatPnl(String(p.unrealizedPnl ?? p.unrealPnl ?? '0')),
              String(p.leverage ?? p.initLeverage ?? ''),
            ]),
          );
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── orders ───

  account
    .command('orders')
    .description('Active orders')
    .option('-s, --symbol <symbol>', 'Filter by symbol')
    .option('-n, --size <size>', 'Page size', '50')
    .action(async (opts: { symbol?: string; size: string }, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const contractId = opts.symbol ? resolveSymbol(contracts, opts.symbol)?.contractId : undefined;
        const data = await client.getActiveOrders(contractId, opts.size);
        const orders = data.dataList ?? [];

        output(fmt, data, () => {
          if (orders.length === 0) {
            console.log(chalk.gray('No active orders'));
            return;
          }
          printTable(
            ['Order ID', 'Symbol', 'Side', 'Type', 'Price', 'Size', 'Filled', 'Status'],
            orders.map(o => {
              const d = o as unknown as Record<string, unknown>;
              return [
                String(d.orderId ?? ''),
                contractName(String(d.contractId ?? '')),
                String(d.side ?? ''),
                String(d.type ?? d.orderType ?? ''),
                String(d.price ?? ''),
                String(d.size ?? ''),
                String(d.filledSize ?? d.cumFilledSize ?? '0'),
                String(d.status ?? ''),
              ];
            }),
          );
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── leverage ───

  account
    .command('leverage <symbol> <multiplier>')
    .description('Set leverage for a contract')
    .action(async (symbol: string, multiplier: string, _opts: unknown, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const contract = resolveSymbol(contracts, symbol);
        if (!contract) throw new EdgexError(`Unknown symbol: ${symbol}`);

        const data = await client.updateLeverageSetting(contract.contractId, multiplier);

        output(fmt, data, () => {
          console.log(chalk.green(`Leverage set to ${multiplier}x for ${contract.contractName}`));
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── position-transactions ───

  account
    .command('position-txs')
    .description('Position transaction history')
    .option('-n, --size <size>', 'Page size', '10')
    .option('-s, --symbol <symbol>', 'Filter by symbol')
    .action(async (opts: { size: string; symbol?: string }, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const filterContractIdList = opts.symbol
          ? [resolveSymbol(contracts, opts.symbol)?.contractId].filter(Boolean) as string[]
          : undefined;
        const data = await client.getPositionTransactionPage({ size: opts.size, filterContractIdList });
        output(fmt, data, () => {
          const d = data as Record<string, unknown>;
          const list = (d.dataList ?? []) as Record<string, unknown>[];
          if (list.length === 0) {
            console.log(chalk.gray('No position transactions'));
            return;
          }
          printTable(
            ['TX ID', 'Symbol', 'Type', 'Size', 'Price', 'PnL', 'Time'],
            list.map(t => [
              String(t.transactionId ?? t.id ?? ''),
              contractName(String(t.contractId ?? '')),
              String(t.transactionType ?? t.type ?? ''),
              String(t.size ?? ''),
              String(t.price ?? ''),
              String(t.realizedPnl ?? t.pnl ?? ''),
              t.createdTime ? new Date(Number(t.createdTime)).toLocaleString() : '',
            ]),
          );
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── collateral-transactions ───

  account
    .command('collateral-txs')
    .description('Collateral transaction history')
    .option('-n, --size <size>', 'Page size', '10')
    .action(async (opts: { size: string }, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const data = await client.getCollateralTransactionPage({ size: opts.size });
        output(fmt, data, () => {
          const d = data as Record<string, unknown>;
          const list = (d.dataList ?? []) as Record<string, unknown>[];
          if (list.length === 0) {
            console.log(chalk.gray('No collateral transactions'));
            return;
          }
          printTable(
            ['TX ID', 'Type', 'Amount', 'Balance After', 'Time'],
            list.map(t => [
              String(t.transactionId ?? t.id ?? ''),
              String(t.transactionType ?? t.type ?? ''),
              String(t.deltaAmount ?? t.amount ?? ''),
              String(t.afterAmount ?? ''),
              t.createdTime ? new Date(Number(t.createdTime)).toLocaleString() : '',
            ]),
          );
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── position-terms ───

  account
    .command('position-terms')
    .description('Position term history (closed positions)')
    .option('-n, --size <size>', 'Page size', '10')
    .option('-s, --symbol <symbol>', 'Filter by symbol')
    .action(async (opts: { size: string; symbol?: string }, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const filterContractIdList = opts.symbol
          ? [resolveSymbol(contracts, opts.symbol)?.contractId].filter(Boolean) as string[]
          : undefined;
        const data = await client.getPositionTermPage({ size: opts.size, filterContractIdList });
        output(fmt, data, () => {
          const d = data as Record<string, unknown>;
          const list = (d.dataList ?? []) as Record<string, unknown>[];
          if (list.length === 0) {
            console.log(chalk.gray('No position terms'));
            return;
          }
          printTable(
            ['Term ID', 'Symbol', 'Side', 'Size', 'Entry', 'Exit', 'PnL', 'Time'],
            list.map(t => [
              String(t.termId ?? t.id ?? ''),
              contractName(String(t.contractId ?? '')),
              String(t.side ?? ''),
              String(t.size ?? ''),
              String(t.entryPrice ?? ''),
              String(t.exitPrice ?? ''),
              String(t.realizedPnl ?? ''),
              t.createdTime ? new Date(Number(t.createdTime)).toLocaleString() : '',
            ]),
          );
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── snapshots ───

  account
    .command('snapshots')
    .description('Account asset snapshots')
    .option('-n, --size <size>', 'Page size', '10')
    .action(async (opts: { size: string }, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const data = await client.getAccountAssetSnapshotPage({ size: opts.size });
        output(fmt, data, () => {
          console.log(chalk.bold('Account Snapshots\n'));
          console.log(JSON.stringify(data, null, 2));
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── deleverage ───

  account
    .command('deleverage')
    .description('Account deleverage light status')
    .action(async (_opts: unknown, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const data = await client.getAccountDeleverageLight();
        output(fmt, data, () => {
          console.log(chalk.bold('Deleverage Light\n'));
          console.log(JSON.stringify(data, null, 2));
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── info ───

  account
    .command('info')
    .description('Account details by ID')
    .action(async (_opts: unknown, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const data = await client.getAccountById();
        output(fmt, data, () => {
          console.log(chalk.bold('Account Info\n'));
          console.log(JSON.stringify(data, null, 2));
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });
}
