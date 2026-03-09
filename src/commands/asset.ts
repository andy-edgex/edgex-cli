import { Command } from 'commander';
import chalk from 'chalk';
import type { OutputFormat, CoinMeta } from '../core/types.js';
import { EdgexClient } from '../core/client.js';
import { loadConfig } from '../core/config.js';
import { loadCachedContracts, saveCachedContracts, getCachedCoins } from '../core/symbols.js';
import { computeWithdrawalL2Fields } from '../core/l2-signer.js';
import { trackDeposit, getDefaultChains } from '../core/deposit-tracker.js';
import { output, printTable, printKeyValue } from '../utils/output.js';
import { handleError } from '../utils/errors.js';

let client: EdgexClient;
let coins: CoinMeta[];
let starkPrivateKey: string;

async function init(): Promise<void> {
  const config = await loadConfig();
  client = new EdgexClient(config);
  starkPrivateKey = config.starkPrivateKey ?? '';

  const cached = await loadCachedContracts();
  if (cached) {
    coins = getCachedCoins() ?? [];
  } else {
    const meta = await client.getMetaData();
    coins = meta.coinList ?? [];
    await saveCachedContracts(meta.contractList, coins);
  }
}

function getFormat(cmd: Command): OutputFormat {
  return cmd.optsWithGlobals().json ? 'json' : 'human';
}

export function registerAssetCommand(program: Command): void {
  const asset = program
    .command('asset')
    .description('Asset & withdrawal management (requires authentication)');

  // ─── orders ───

  asset
    .command('orders')
    .description('Asset order history (deposits, withdrawals, transfers)')
    .option('-n, --size <size>', 'Page size', '10')
    .action(async (opts: { size: string }, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const data = await client.getAssetOrdersPage({ size: opts.size });
        output(fmt, data, () => {
          const d = data as Record<string, unknown>;
          const list = (d.dataList ?? []) as Record<string, unknown>[];
          if (list.length === 0) {
            console.log(chalk.gray('No asset orders'));
            return;
          }
          printTable(
            ['Order ID', 'Type', 'Coin', 'Amount', 'Status', 'Time'],
            list.map(o => [
              String(o.orderId ?? o.id ?? ''),
              String(o.orderType ?? o.type ?? ''),
              String(o.coinId ?? ''),
              String(o.amount ?? ''),
              String(o.status ?? ''),
              o.createdTime ? new Date(Number(o.createdTime)).toLocaleString() : '',
            ]),
          );
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── coin-rate ───

  asset
    .command('coin-rate')
    .description('Get coin exchange rate')
    .option('--chain <chainId>', 'Chain ID', '1')
    .option('--coin <address>', 'Coin contract address', '0xdac17f958d2ee523a2206206994597c13d831ec7')
    .action(async (opts: { chain: string; coin: string }, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const data = await client.getCoinRate(opts.chain, opts.coin);
        output(fmt, data, () => {
          console.log(chalk.bold('Coin Rate\n'));
          console.log(JSON.stringify(data, null, 2));
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── withdraw ───

  asset
    .command('withdraw <coinId> <amount> <ethAddress>')
    .description('Create withdrawal (L2 signed)')
    .action(async (coinId: string, amount: string, ethAddress: string, _opts: unknown, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);

        // Find coin metadata
        const meta = await client.getMetaData();
        const allCoins = (meta as unknown as Record<string, unknown>).coinList as Record<string, unknown>[] | undefined;
        const coin = allCoins?.find((c: Record<string, unknown>) => c.coinId === coinId);
        if (!coin) throw new Error(`Coin not found: ${coinId}`);

        const starkExAssetId = String(coin.starkExAssetId ?? '');
        const resolution = Number(BigInt(String(coin.starkExResolution ?? '0xf4240')));

        // Normalize amount using starkExResolution
        const normalizedAmount = String(Math.floor(parseFloat(amount) * resolution));

        const l2 = computeWithdrawalL2Fields(
          starkPrivateKey,
          client.currentAccountId!,
          starkExAssetId,
          ethAddress,
          normalizedAmount,
        );

        const data = await client.createNormalWithdraw({
          coinId,
          amount,
          ethAddress,
          clientWithdrawId: l2.clientWithdrawId,
          expireTime: l2.l2ExpireTime,
          l2Signature: l2.l2Signature,
        });

        output(fmt, data, () => {
          console.log(chalk.green('Withdrawal created successfully'));
          console.log(JSON.stringify(data, null, 2));
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── withdraw-history ───

  asset
    .command('withdraw-history')
    .description('Withdrawal records')
    .option('-n, --size <size>', 'Page size', '10')
    .action(async (opts: { size: string }, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const data = await client.getNormalWithdrawById({ size: opts.size });
        output(fmt, data, () => {
          const d = data as Record<string, unknown>;
          const list = (d.dataList ?? []) as Record<string, unknown>[];
          if (list.length === 0) {
            console.log(chalk.gray('No withdrawal records'));
            return;
          }
          printTable(
            ['ID', 'Coin', 'Amount', 'Address', 'Status', 'Time'],
            list.map(w => [
              String(w.withdrawId ?? w.id ?? ''),
              String(w.coinId ?? ''),
              String(w.amount ?? ''),
              String(w.ethAddress ?? ''),
              String(w.status ?? ''),
              w.createdTime ? new Date(Number(w.createdTime)).toLocaleString() : '',
            ]),
          );
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── withdrawable ───

  asset
    .command('withdrawable <address>')
    .description('Get withdrawable amount for a coin address')
    .action(async (address: string, _opts: unknown, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const data = await client.getNormalWithdrawableAmount(address);
        output(fmt, data, () => {
          console.log(chalk.bold('Withdrawable Amount\n'));
          console.log(JSON.stringify(data, null, 2));
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── spot-balance ───

  asset
    .command('spot-balance')
    .description('Query Spot vault USDC balance on Edge chain (on-chain RPC)')
    .option('--rpc <url>', 'Edge chain RPC URL', 'https://edge-mainnet.g.alchemy.com/public')
    .action(async (opts: { rpc: string }, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);

        const meta = await client.getMetaData() as Record<string, unknown>;
        const global = meta.global as Record<string, unknown> | undefined;
        const spotVault = String(global?.spotVaultAddress ?? '0x238E0EDEb0E217fEcd9e1Ca98efA1219Fc841487');
        const usdcAddress = String(global?.transferTokenAddress ?? '0xd8e20462EDCe38434616Cc6A6a560BB76B582ED8');
        const decimals = Number(global?.transferTokenDecimals ?? 6);

        // ERC-20 balanceOf(address) call
        const balanceOfSelector = '0x70a08231';
        const paddedAddress = spotVault.replace('0x', '').toLowerCase().padStart(64, '0');
        const callData = balanceOfSelector + paddedAddress;

        const rpcResult = await fetch(opts.rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_call',
            params: [{ to: usdcAddress, data: callData }, 'latest'],
            id: 1,
          }),
        });
        const json = await rpcResult.json() as { result?: string; error?: { message: string } };

        if (json.error) throw new Error(`RPC error: ${json.error.message}`);

        const rawBalance = BigInt(json.result ?? '0x0');
        const humanBalance = Number(rawBalance) / (10 ** decimals);

        const result = {
          spotVault,
          usdcToken: usdcAddress,
          chain: 'Edge (3343)',
          rpc: opts.rpc,
          rawBalance: rawBalance.toString(),
          balance: humanBalance.toFixed(decimals),
        };

        output(fmt, result, () => {
          console.log(chalk.bold('Spot Vault USDC Balance (On-Chain)\n'));
          printKeyValue([
            ['Spot Vault', spotVault],
            ['USDC Token', usdcAddress],
            ['Chain', 'Edge (3343)'],
            ['Balance', `${humanBalance.toLocaleString()} USDC`],
          ]);
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });

  // ─── deposit-status ───

  asset
    .command('deposit-status <txHash>')
    .description('Track cross-chain or direct deposit status by tx hash (on-chain RPC)')
    .option('--chain <name>', 'Only query a specific chain (edge, arb, eth, bsc)')
    .action(async (txHash: string, opts: { chain?: string }, cmd: Command) => {
      try {
        const config = await loadConfig();
        const fmt = getFormat(cmd);
        let chains = getDefaultChains(config.edgeChainRpcUrl);

        if (opts.chain) {
          const filter = opts.chain.toLowerCase();
          const map: Record<string, string> = {
            edge: 'Edge Chain', arb: 'Arbitrum', arbitrum: 'Arbitrum',
            eth: 'Ethereum', ethereum: 'Ethereum', bsc: 'BSC',
          };
          const target = map[filter];
          if (target) chains = chains.filter(c => c.name === target);
        }

        const result = await trackDeposit(txHash, chains);

        output(fmt, result, () => {
          console.log(chalk.bold('Deposit Status\n'));

          const statusColor = {
            not_found: chalk.gray,
            pending: chalk.yellow,
            failed: chalk.red,
            confirmed: chalk.cyan,
            credited: chalk.green,
          }[result.status] ?? chalk.white;

          const pairs: [string, string][] = [
            ['Status', statusColor(result.status.toUpperCase())],
            ['Tx Hash', result.txHash],
            ['Chain', result.chain],
          ];
          if (result.blockNumber) pairs.push(['Block', String(result.blockNumber)]);
          if (result.amount) pairs.push(['Amount', `${result.amount} ${result.asset ?? ''}`]);
          if (result.accountId) pairs.push(['Account/Key', result.accountId]);
          if (result.to) pairs.push(['Contract', result.to]);
          if (result.timestamp) pairs.push(['Time', new Date(result.timestamp * 1000).toISOString()]);
          if (result.details?.type) pairs.push(['Type', result.details.type]);

          printKeyValue(pairs);

          if (result.status === 'confirmed' && result.chain !== 'Edge Chain') {
            console.log(chalk.gray('\n  Source chain confirmed. Awaiting CCTP relay to Edge chain.'));
          }
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });
}
