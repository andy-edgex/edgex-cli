import chalk from 'chalk';
import { EdgexClient } from '../core/client.js';
import { loadConfig } from '../core/config.js';
import { loadCachedContracts, saveCachedContracts, getCachedCoins } from '../core/symbols.js';
import { computeTransferL2Fields } from '../core/l2-signer.js';
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
export function registerTransferCommand(program) {
    const transfer = program
        .command('transfer')
        .description('Transfer management (requires authentication)');
    // ─── available-amount ───
    transfer
        .command('available <coinId>')
        .description('Get transferable amount for a coin')
        .action(async (coinId, _opts, cmd) => {
        try {
            await init();
            const fmt = getFormat(cmd);
            const data = await client.getTransferOutAvailableAmount(coinId);
            output(fmt, data, () => {
                const d = data;
                console.log(chalk.bold('Transfer Available Amount\n'));
                printKeyValue([
                    ['Available Amount', String(d.availableAmount ?? d.maxAmount ?? JSON.stringify(data))],
                ]);
            });
        }
        catch (err) {
            handleError(err, getFormat(cmd));
        }
    });
    // ─── create ───
    transfer
        .command('create <coinId> <amount> <receiverAccountId> <receiverL2Key>')
        .description('Create transfer to another account (L2 signed)')
        .option('--reason <reason>', 'Transfer reason', 'USER_TRANSFER')
        .option('--extra-type <type>', 'Extra type field')
        .option('--extra-data <json>', 'Extra data JSON (e.g. for cross-chain withdraw)')
        .action(async (coinId, amount, receiverAccountId, receiverL2Key, opts, cmd) => {
        try {
            await init();
            const fmt = getFormat(cmd);
            // Get metadata for collateral coin asset ID
            const meta = await client.getMetaData();
            const globalData = meta;
            const global = globalData.global;
            const collateralCoin = global?.starkExCollateralCoin;
            if (!collateralCoin?.starkExAssetId) {
                throw new Error('Cannot find starkExCollateralCoin in metadata');
            }
            const assetId = BigInt(collateralCoin.starkExAssetId);
            // Parse receiver L2 key
            const recvKey = receiverL2Key.startsWith('0x') ? receiverL2Key.slice(2) : receiverL2Key;
            const receiverPublicKey = BigInt('0x' + recvKey);
            // Amount in protocol format (shift by 6 decimals)
            const amountBig = BigInt(Math.floor(parseFloat(amount) * 1e6));
            const l2 = computeTransferL2Fields(starkPrivateKey, client.currentAccountId, assetId, receiverPublicKey, receiverAccountId, amountBig);
            const body = {
                coinId,
                amount,
                receiverAccountId,
                receiverL2Key,
                clientTransferId: l2.clientTransferId,
                transferReason: opts.reason,
                l2Nonce: l2.l2Nonce,
                l2ExpireTime: l2.l2ExpireTime,
                l2Signature: l2.l2Signature,
            };
            if (opts.extraType)
                body.extraType = opts.extraType;
            if (opts.extraData)
                body.extraDataJson = opts.extraData;
            const data = await client.createTransferOut(body);
            output(fmt, data, () => {
                console.log(chalk.green('Transfer created successfully'));
                console.log(JSON.stringify(data, null, 2));
            });
        }
        catch (err) {
            handleError(err, getFormat(cmd));
        }
    });
    // ─── out-history ───
    transfer
        .command('out-history')
        .description('Transfer out history')
        .option('-n, --size <size>', 'Page size', '10')
        .action(async (opts, cmd) => {
        try {
            await init();
            const fmt = getFormat(cmd);
            const data = await client.getActiveTransferOut({ size: opts.size });
            output(fmt, data, () => {
                const d = data;
                const list = (d.dataList ?? []);
                if (list.length === 0) {
                    console.log(chalk.gray('No transfer out records'));
                    return;
                }
                printTable(['Transfer ID', 'Coin', 'Amount', 'Receiver', 'Status', 'Time'], list.map(t => [
                    String(t.transferId ?? t.id ?? ''),
                    String(t.coinId ?? ''),
                    String(t.amount ?? ''),
                    String(t.receiverAccountId ?? ''),
                    String(t.status ?? ''),
                    t.createdTime ? new Date(Number(t.createdTime)).toLocaleString() : '',
                ]));
            });
        }
        catch (err) {
            handleError(err, getFormat(cmd));
        }
    });
    // ─── in-history ───
    transfer
        .command('in-history')
        .description('Transfer in history')
        .option('-n, --size <size>', 'Page size', '10')
        .action(async (opts, cmd) => {
        try {
            await init();
            const fmt = getFormat(cmd);
            const data = await client.getActiveTransferIn({ size: opts.size });
            output(fmt, data, () => {
                const d = data;
                const list = (d.dataList ?? []);
                if (list.length === 0) {
                    console.log(chalk.gray('No transfer in records'));
                    return;
                }
                printTable(['Transfer ID', 'Coin', 'Amount', 'Sender', 'Status', 'Time'], list.map(t => [
                    String(t.transferId ?? t.id ?? ''),
                    String(t.coinId ?? ''),
                    String(t.amount ?? ''),
                    String(t.senderAccountId ?? ''),
                    String(t.status ?? ''),
                    t.createdTime ? new Date(Number(t.createdTime)).toLocaleString() : '',
                ]));
            });
        }
        catch (err) {
            handleError(err, getFormat(cmd));
        }
    });
    // ─── lookup ───
    // ─── cross-withdraw ───
    transfer
        .command('cross-withdraw <amount> <ethAddress>')
        .description('Cross-chain withdraw via fast-withdraw account (e.g. to Arb)')
        .option('--chain-id <chainId>', 'Target chain ID (42161=Arb, 3343=Edge)', '42161')
        .option('--coin <coinId>', 'Coin ID', '1000')
        .action(async (amount, ethAddress, opts, cmd) => {
        try {
            await init();
            const fmt = getFormat(cmd);
            const meta = await client.getMetaData();
            const globalData = meta;
            const global = globalData.global;
            const collateralCoin = global?.starkExCollateralCoin;
            if (!collateralCoin?.starkExAssetId) {
                throw new Error('Cannot find starkExCollateralCoin in metadata');
            }
            const fastWithdrawAccountId = String(global?.fastWithdrawAccountId ?? '');
            const fastWithdrawL2Key = String(global?.fastWithdrawAccountL2Key ?? '');
            if (!fastWithdrawAccountId || !fastWithdrawL2Key) {
                throw new Error('Cannot find fastWithdraw account in metadata');
            }
            const assetId = BigInt(collateralCoin.starkExAssetId);
            const recvKey = fastWithdrawL2Key.startsWith('0x') ? fastWithdrawL2Key.slice(2) : fastWithdrawL2Key;
            const receiverPublicKey = BigInt('0x' + recvKey);
            const amountBig = BigInt(Math.floor(parseFloat(amount) * 1e6));
            const l2 = computeTransferL2Fields(starkPrivateKey, client.currentAccountId, assetId, receiverPublicKey, fastWithdrawAccountId, amountBig);
            const extraData = JSON.stringify({
                chainId: parseInt(opts.chainId),
                address: ethAddress,
            });
            const data = await client.createTransferOut({
                coinId: opts.coin,
                amount,
                receiverAccountId: fastWithdrawAccountId,
                receiverL2Key: fastWithdrawL2Key,
                clientTransferId: l2.clientTransferId,
                transferReason: 'CROSS_WITHDRAW',
                l2Nonce: l2.l2Nonce,
                l2ExpireTime: l2.l2ExpireTime,
                l2Signature: l2.l2Signature,
                extraDataJson: extraData,
            });
            output(fmt, data, () => {
                console.log(chalk.green('Cross-chain withdraw submitted'));
                console.log(JSON.stringify(data, null, 2));
            });
        }
        catch (err) {
            handleError(err, getFormat(cmd));
        }
    });
    // ─── lookup ───
    transfer
        .command('lookup <direction> <ids>')
        .description('Lookup transfer by ID (direction: in or out, comma-separated IDs)')
        .action(async (direction, ids, _opts, cmd) => {
        try {
            await init();
            const fmt = getFormat(cmd);
            const idList = ids.split(',').map(s => s.trim()).filter(Boolean);
            const data = direction === 'in'
                ? await client.getTransferInById(idList)
                : await client.getTransferOutById(idList);
            output(fmt, data, () => {
                console.log(JSON.stringify(data, null, 2));
            });
        }
        catch (err) {
            handleError(err, getFormat(cmd));
        }
    });
}
//# sourceMappingURL=transfer.js.map