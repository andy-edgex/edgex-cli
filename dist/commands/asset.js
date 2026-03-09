import chalk from 'chalk';
import { EdgexClient } from '../core/client.js';
import { loadConfig } from '../core/config.js';
import { loadCachedContracts, saveCachedContracts, getCachedCoins } from '../core/symbols.js';
import { computeWithdrawalL2Fields } from '../core/l2-signer.js';
import { output, printTable, printKeyValue } from '../utils/output.js';
import { handleError } from '../utils/errors.js';
let client;
let coins;
let starkPrivateKey;
async function init() {
    const config = await loadConfig();
    client = new EdgexClient(config);
    starkPrivateKey = config.starkPrivateKey ?? '';
    const cached = await loadCachedContracts();
    if (cached) {
        coins = getCachedCoins() ?? [];
    }
    else {
        const meta = await client.getMetaData();
        coins = meta.coinList ?? [];
        await saveCachedContracts(meta.contractList, coins);
    }
}
function getFormat(cmd) {
    return cmd.optsWithGlobals().json ? 'json' : 'human';
}
export function registerAssetCommand(program) {
    const asset = program
        .command('asset')
        .description('Asset & withdrawal management (requires authentication)');
    // ─── orders ───
    asset
        .command('orders')
        .description('Asset order history (deposits, withdrawals, transfers)')
        .option('-n, --size <size>', 'Page size', '10')
        .action(async (opts, cmd) => {
        try {
            await init();
            const fmt = getFormat(cmd);
            const data = await client.getAssetOrdersPage({ size: opts.size });
            output(fmt, data, () => {
                const d = data;
                const list = (d.dataList ?? []);
                if (list.length === 0) {
                    console.log(chalk.gray('No asset orders'));
                    return;
                }
                printTable(['Order ID', 'Type', 'Coin', 'Amount', 'Status', 'Time'], list.map(o => [
                    String(o.orderId ?? o.id ?? ''),
                    String(o.orderType ?? o.type ?? ''),
                    String(o.coinId ?? ''),
                    String(o.amount ?? ''),
                    String(o.status ?? ''),
                    o.createdTime ? new Date(Number(o.createdTime)).toLocaleString() : '',
                ]));
            });
        }
        catch (err) {
            handleError(err, getFormat(cmd));
        }
    });
    // ─── coin-rate ───
    asset
        .command('coin-rate')
        .description('Get coin exchange rate')
        .option('--chain <chainId>', 'Chain ID', '1')
        .option('--coin <address>', 'Coin contract address', '0xdac17f958d2ee523a2206206994597c13d831ec7')
        .action(async (opts, cmd) => {
        try {
            await init();
            const fmt = getFormat(cmd);
            const data = await client.getCoinRate(opts.chain, opts.coin);
            output(fmt, data, () => {
                console.log(chalk.bold('Coin Rate\n'));
                console.log(JSON.stringify(data, null, 2));
            });
        }
        catch (err) {
            handleError(err, getFormat(cmd));
        }
    });
    // ─── withdraw ───
    asset
        .command('withdraw <coinId> <amount> <ethAddress>')
        .description('Create withdrawal (L2 signed)')
        .action(async (coinId, amount, ethAddress, _opts, cmd) => {
        try {
            await init();
            const fmt = getFormat(cmd);
            // Find coin metadata
            const meta = await client.getMetaData();
            const allCoins = meta.coinList;
            const coin = allCoins?.find((c) => c.coinId === coinId);
            if (!coin)
                throw new Error(`Coin not found: ${coinId}`);
            const starkExAssetId = String(coin.starkExAssetId ?? '');
            const resolution = Number(BigInt(String(coin.starkExResolution ?? '0xf4240')));
            // Normalize amount using starkExResolution
            const normalizedAmount = String(Math.floor(parseFloat(amount) * resolution));
            const l2 = computeWithdrawalL2Fields(starkPrivateKey, client.currentAccountId, starkExAssetId, ethAddress, normalizedAmount);
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
        }
        catch (err) {
            handleError(err, getFormat(cmd));
        }
    });
    // ─── withdraw-history ───
    asset
        .command('withdraw-history')
        .description('Withdrawal records')
        .option('-n, --size <size>', 'Page size', '10')
        .action(async (opts, cmd) => {
        try {
            await init();
            const fmt = getFormat(cmd);
            const data = await client.getNormalWithdrawById({ size: opts.size });
            output(fmt, data, () => {
                const d = data;
                const list = (d.dataList ?? []);
                if (list.length === 0) {
                    console.log(chalk.gray('No withdrawal records'));
                    return;
                }
                printTable(['ID', 'Coin', 'Amount', 'Address', 'Status', 'Time'], list.map(w => [
                    String(w.withdrawId ?? w.id ?? ''),
                    String(w.coinId ?? ''),
                    String(w.amount ?? ''),
                    String(w.ethAddress ?? ''),
                    String(w.status ?? ''),
                    w.createdTime ? new Date(Number(w.createdTime)).toLocaleString() : '',
                ]));
            });
        }
        catch (err) {
            handleError(err, getFormat(cmd));
        }
    });
    // ─── withdrawable ───
    asset
        .command('withdrawable <address>')
        .description('Get withdrawable amount for a coin address')
        .action(async (address, _opts, cmd) => {
        try {
            await init();
            const fmt = getFormat(cmd);
            const data = await client.getNormalWithdrawableAmount(address);
            output(fmt, data, () => {
                console.log(chalk.bold('Withdrawable Amount\n'));
                console.log(JSON.stringify(data, null, 2));
            });
        }
        catch (err) {
            handleError(err, getFormat(cmd));
        }
    });
    // ─── spot-balance ───
    asset
        .command('spot-balance')
        .description('Query Spot vault USDC balance on Edge chain (on-chain RPC)')
        .option('--rpc <url>', 'Edge chain RPC URL', 'https://edge-mainnet.g.alchemy.com/public')
        .action(async (opts, cmd) => {
        try {
            await init();
            const fmt = getFormat(cmd);
            const meta = await client.getMetaData();
            const global = meta.global;
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
            const json = await rpcResult.json();
            if (json.error)
                throw new Error(`RPC error: ${json.error.message}`);
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
        }
        catch (err) {
            handleError(err, getFormat(cmd));
        }
    });
}
//# sourceMappingURL=asset.js.map