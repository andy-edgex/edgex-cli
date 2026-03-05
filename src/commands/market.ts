import { Command } from 'commander';
import chalk from 'chalk';
import type { OutputFormat, ContractMeta } from '../core/types.js';
import { KLINE_INTERVALS } from '../core/types.js';
import { EdgexClient } from '../core/client.js';
import { loadConfig } from '../core/config.js';
import { loadCachedContracts, saveCachedContracts, resolveSymbol, formatSymbolName } from '../core/symbols.js';
import { output, printTable, printKeyValue, formatPrice, formatPercent, formatPnl } from '../utils/output.js';
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

function requireSymbol(symbol: string | undefined): ContractMeta {
  if (!symbol) throw new EdgexError('Symbol is required');
  const contract = resolveSymbol(contracts, symbol);
  if (!contract) throw new EdgexError(`Unknown symbol: ${symbol}. Use "edgex market ticker" to list available contracts.`);
  return contract;
}

function getFormat(cmd: Command): OutputFormat {
  return cmd.optsWithGlobals().json ? 'json' : 'human';
}

export function registerMarketCommand(program: Command): void {
  const market = program
    .command('market')
    .description('Market data (public, no auth required)');

  // ─── ticker ───

  market
    .command('ticker [symbol]')
    .description('24h ticker (omit symbol for all)')
    .action(async (symbol: string | undefined, _opts: unknown, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const contractId = symbol ? requireSymbol(symbol).contractId : undefined;
        const data = await client.getTicker(contractId);

        output(fmt, data, () => {
          if (!Array.isArray(data) || data.length === 0) {
            console.log(chalk.gray('No ticker data'));
            return;
          }
          printTable(
            ['Symbol', 'Last Price', 'Change 24h', 'High', 'Low', 'Volume', 'OI'],
            data.map(t => [
              t.contractName,
              formatPrice(t.lastPrice, true),
              formatPercent(t.priceChangePercent),
              t.high,
              t.low,
              t.value,
              t.openInterest,
            ]),
          );
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── depth ───

  market
    .command('depth <symbol>')
    .description('Order book depth')
    .option('-l, --level <level>', 'Depth levels: 15 or 200', '15')
    .action(async (symbol: string, opts: { level: string }, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const contract = requireSymbol(symbol);
        const data = await client.getDepth(contract.contractId, opts.level);

        output(fmt, data, () => {
          console.log(chalk.bold(`Order Book: ${formatSymbolName(contract)}\n`));

          console.log(chalk.red.bold('  Asks (sell)'));
          const asks = (data.asks || []).slice(0, 10).reverse();
          for (const a of asks) {
            console.log(`  ${chalk.red(a.price.padStart(12))}  ${a.size}`);
          }

          console.log(chalk.gray('  ─────────────────'));

          const bids = (data.bids || []).slice(0, 10);
          for (const b of bids) {
            console.log(`  ${chalk.green(b.price.padStart(12))}  ${b.size}`);
          }
          console.log(chalk.green.bold('  Bids (buy)'));
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── kline ───

  market
    .command('kline <symbol>')
    .description('Kline / candlestick data')
    .option('-i, --interval <interval>', 'Interval: 1m/5m/15m/30m/1h/2h/4h/6h/8h/12h/1d/1w/1M', '1h')
    .option('-n, --limit <limit>', 'Number of bars', '20')
    .action(async (symbol: string, opts: { interval: string; limit: string }, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const contract = requireSymbol(symbol);
        const klineType = KLINE_INTERVALS[opts.interval];
        if (!klineType) throw new EdgexError(`Invalid interval: ${opts.interval}. Valid: ${Object.keys(KLINE_INTERVALS).join(', ')}`);

        const data = await client.getKline(contract.contractId, klineType, opts.limit);

        output(fmt, data, () => {
          console.log(chalk.bold(`Kline: ${formatSymbolName(contract)} (${opts.interval})\n`));
          const bars = data.dataList || [];
          if (bars.length === 0) {
            console.log(chalk.gray('No kline data available'));
            return;
          }
          printTable(
            ['Time', 'Open', 'High', 'Low', 'Close', 'Volume (USD)'],
            bars.map(b => [
              new Date(Number(b.klineTime)).toLocaleString(),
              b.open,
              b.high,
              b.low,
              formatPrice(b.close, true),
              b.amount ?? b.value ?? b.size ?? '',
            ]),
          );
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── funding ───

  market
    .command('funding [symbol]')
    .description('Funding rates (omit symbol for all)')
    .action(async (symbol: string | undefined, _opts: unknown, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const contractId = symbol ? requireSymbol(symbol).contractId : undefined;
        const data = await client.getLatestFundingRate(contractId);

        output(fmt, data, () => {
          if (!Array.isArray(data) || data.length === 0) {
            console.log(chalk.gray('No funding rate data'));
            return;
          }
          printTable(
            ['Contract ID', 'Funding Rate', 'Forecast', 'Previous', 'Timestamp'],
            data.map(f => {
              const d = f as unknown as Record<string, string>;
              return [
                d.contractId ?? '',
                formatPnl(d.fundingRate ?? ''),
                d.forecastFundingRate ?? '',
                d.previousFundingRate ?? '',
                new Date(Number(d.fundingTimestamp)).toLocaleString(),
              ];
            }),
          );
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── summary ───

  market
    .command('summary')
    .description('Market-wide trading volume summary')
    .action(async (_opts: unknown, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const data = await client.getTickerSummary();

        output(fmt, data, () => {
          const d = data as Record<string, unknown>;
          const summary = (d.tickerSummary ?? d) as Record<string, string>;
          console.log(chalk.bold('Market Summary\n'));
          printKeyValue([
            ['Trades', summary.trades ?? 'N/A'],
            ['Volume (USD)', summary.value ?? 'N/A'],
            ['Open Interest', summary.openInterest ?? 'N/A'],
          ]);
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── ratio ───

  market
    .command('ratio [symbol]')
    .description('Long/short ratio (omit symbol for all)')
    .action(async (symbol: string | undefined, _opts: unknown, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const contractId = symbol ? requireSymbol(symbol).contractId : undefined;
        const data = await client.getLongShortRatio(contractId);
        const list = data.exchangeLongShortRatioList || [];

        output(fmt, data, () => {
          if (list.length === 0) {
            console.log(chalk.gray('No long/short ratio data'));
            return;
          }
          printTable(
            ['Exchange', 'Range', 'Long %', 'Short %', 'Buy Vol (USD)', 'Sell Vol (USD)'],
            list.map(r => [
              r.exchange,
              r.range,
              chalk.green(r.buyRatio + '%'),
              chalk.red(r.sellRatio + '%'),
              r.buyVolUsd,
              r.sellVolUsd,
            ]),
          );
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });
}
