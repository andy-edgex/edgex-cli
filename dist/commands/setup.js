import chalk from 'chalk';
import { saveConfig, loadConfig, getConfigPath, isTestnet } from '../core/config.js';
import { handleError } from '../utils/errors.js';
function printSecurityWarning() {
    const border = chalk.yellow('─'.repeat(60));
    console.log(`\n${border}`);
    console.log(chalk.yellow.bold('  ⚠  SECURITY NOTICE'));
    console.log(border);
    console.log(chalk.yellow('  • Use a SUB-ACCOUNT key, never your main account private key'));
    console.log(chalk.yellow('  • Set withdrawal whitelist on your main account'));
    console.log(chalk.yellow('  • The private key is stored in plaintext at:'));
    console.log(chalk.yellow(`    ${getConfigPath()}`));
    console.log(chalk.yellow('  • File permissions are set to 600 (owner read/write only)'));
    console.log(`${border}\n`);
}
export function registerSetupCommand(program) {
    program
        .command('setup')
        .description('Configure EdgeX CLI credentials')
        .option('--account-id <id>', 'EdgeX Account ID')
        .option('--private-key <key>', 'StarkEx Private Key')
        .option('--base-url <url>', 'API base URL')
        .option('--ws-url <url>', 'WebSocket URL')
        .action(async (opts) => {
        try {
            const network = isTestnet() ? 'testnet' : 'mainnet';
            if (opts.accountId || opts.privateKey || opts.baseUrl || opts.wsUrl) {
                if (opts.privateKey)
                    printSecurityWarning();
                const config = {};
                if (opts.accountId)
                    config.accountId = opts.accountId;
                if (opts.privateKey)
                    config.starkPrivateKey = opts.privateKey;
                if (opts.baseUrl)
                    config.baseUrl = opts.baseUrl;
                if (opts.wsUrl)
                    config.wsUrl = opts.wsUrl;
                await saveConfig(config);
                console.log(chalk.green(`[${network}] Configuration saved to ${getConfigPath()}`));
                return;
            }
            const { default: Enquirer } = await import('enquirer');
            const enquirer = new Enquirer();
            const current = await loadConfig();
            const networkLabel = isTestnet()
                ? chalk.yellow('[TESTNET]')
                : chalk.green('[MAINNET]');
            const siteUrl = isTestnet()
                ? 'https://testnet.edgex.exchange'
                : 'https://pro.edgex.exchange';
            console.log(chalk.bold(`\nEdgeX CLI Setup ${networkLabel}\n`));
            printSecurityWarning();
            console.log(chalk.gray(`Export your Account ID and Private Key from the EdgeX web interface.`));
            console.log(chalk.gray(`See: ${siteUrl}\n`));
            const answers = (await enquirer.prompt([
                {
                    type: 'input',
                    name: 'accountId',
                    message: 'Account ID',
                    initial: current.accountId || '',
                },
                {
                    type: 'password',
                    name: 'starkPrivateKey',
                    message: 'StarkEx Private Key',
                },
            ]));
            const config = {};
            if (answers.accountId)
                config.accountId = answers.accountId;
            if (answers.starkPrivateKey)
                config.starkPrivateKey = answers.starkPrivateKey;
            await saveConfig(config);
            console.log(chalk.green(`\n[${network}] Configuration saved to ${getConfigPath()}`));
        }
        catch (err) {
            handleError(err, program.optsWithGlobals().json ? 'json' : 'human');
        }
    });
}
//# sourceMappingURL=setup.js.map