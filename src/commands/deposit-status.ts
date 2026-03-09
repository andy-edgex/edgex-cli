import { Command } from 'commander';
import chalk from 'chalk';
import type { OutputFormat } from '../core/types.js';
import { loadConfig, isTestnet } from '../core/config.js';
import { trackDeposit, getDefaultChains } from '../core/deposit-tracker.js';
import { output, printKeyValue } from '../utils/output.js';
import { handleError } from '../utils/errors.js';

function getFormat(cmd: Command): OutputFormat {
  return cmd.optsWithGlobals().json ? 'json' : 'human';
}

export function registerDepositStatusCommand(program: Command): void {
  program
    .command('deposit-status <txHash>')
    .description('Track deposit status by tx hash (no auth required, queries on-chain RPC)')
    .option('--chain <name>', 'Only query a specific chain (edge, arb, eth, bsc)')
    .action(async (txHash: string, opts: { chain?: string }, cmd: Command) => {
      try {
        const config = await loadConfig();
        const fmt = getFormat(cmd);
        const testnet = isTestnet();
        let chains = getDefaultChains(config.edgeChainRpcUrl, testnet);

        if (opts.chain) {
          const filter = opts.chain.toLowerCase();
          const map: Record<string, string> = testnet
            ? {
                edge: 'Edge Chain (Testnet)', arb: 'Arbitrum Sepolia', arbitrum: 'Arbitrum Sepolia',
                eth: 'Ethereum Sepolia', ethereum: 'Ethereum Sepolia', bsc: 'BSC Testnet',
              }
            : {
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

          if (result.status === 'confirmed' && !result.chain.startsWith('Edge Chain')) {
            console.log(chalk.gray('\n  Source chain confirmed. Awaiting CCTP relay to Edge chain.'));
          }
        });
      } catch (err) { handleError(err, getFormat(cmd)); }
    });
}
