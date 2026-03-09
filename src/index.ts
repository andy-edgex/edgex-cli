#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { registerMarketCommand } from './commands/market.js';
import { registerSetupCommand } from './commands/setup.js';
import { registerAccountCommand } from './commands/account.js';
import { registerOrderCommand } from './commands/order.js';
import { registerStreamCommand } from './commands/stream.js';
import { registerTransferCommand } from './commands/transfer.js';
import { registerAssetCommand } from './commands/asset.js';
import { registerTestCommand } from './commands/test.js';
import { registerDepositStatusCommand } from './commands/deposit-status.js';
import { startMcpServer } from './mcp/server.js';
import { setupProxy } from './core/proxy.js';

setupProxy();

const program = new Command();

program
  .name('edgex')
  .description('CLI for EdgeX perpetual contract trading')
  .version('0.2.0')
  .option('--json', 'Output in JSON format')
  .option('--testnet', 'Use testnet environment');

program.hook('preAction', (thisCommand) => {
  const opts = thisCommand.optsWithGlobals();
  if (opts.testnet) {
    process.env.EDGEX_TESTNET = '1';
    process.stderr.write(chalk.yellow('[TESTNET] ') + chalk.gray('Using testnet environment\n'));
  }
});

program
  .command('serve-mcp', { hidden: true })
  .description('Start the EdgeX MCP server on stdio')
  .action(() => {
    startMcpServer();
  });

registerSetupCommand(program);
registerMarketCommand(program);
registerAccountCommand(program);
registerOrderCommand(program);
registerTransferCommand(program);
registerAssetCommand(program);
registerStreamCommand(program);
registerTestCommand(program);
registerDepositStatusCommand(program);

program.parse();
