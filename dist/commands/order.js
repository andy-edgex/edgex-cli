import chalk from 'chalk';
import { createInterface } from 'node:readline';
import { EdgexClient } from '../core/client.js';
import { loadConfig } from '../core/config.js';
import { loadCachedContracts, saveCachedContracts, resolveSymbol, getCachedCoins, findCoin } from '../core/symbols.js';
import { output, printKeyValue, printTable } from '../utils/output.js';
import { handleError, EdgexError } from '../utils/errors.js';
import { buildOrderPayload } from '../core/order-service.js';
let client;
let contracts;
let coins;
let starkPrivateKey;
async function init() {
    const config = await loadConfig();
    client = new EdgexClient(config);
    starkPrivateKey = config.starkPrivateKey ?? '';
    const cached = await loadCachedContracts();
    if (cached) {
        contracts = cached;
        coins = getCachedCoins() ?? [];
    }
    else {
        const meta = await client.getMetaData();
        contracts = meta.contractList;
        coins = meta.coinList ?? [];
        await saveCachedContracts(contracts, coins);
    }
}
function getFormat(cmd) {
    return cmd.optsWithGlobals().json ? 'json' : 'human';
}
async function confirmOrder(message) {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    return new Promise(resolve => {
        rl.question(message, answer => {
            rl.close();
            resolve(answer.trim().toLowerCase() === 'y');
        });
    });
}
function contractName(contractId) {
    const c = contracts.find(ct => ct.contractId === contractId);
    return c?.contractName ?? contractId;
}
function getL2Meta(contract) {
    const quoteCoin = findCoin(coins, contract.quoteCoinId ?? '1000');
    if (!contract.starkExSyntheticAssetId || !contract.starkExResolution) {
        throw new EdgexError(`Missing StarkEx metadata for ${contract.contractName}. Try clearing cache: rm ~/.edgex/contracts.json`);
    }
    if (!quoteCoin?.starkExAssetId || !quoteCoin?.starkExResolution) {
        throw new EdgexError(`Missing StarkEx metadata for quote coin. Try clearing cache: rm ~/.edgex/contracts.json`);
    }
    return {
        starkExSyntheticAssetId: contract.starkExSyntheticAssetId,
        syntheticResolution: contract.starkExResolution,
        collateralAssetId: quoteCoin.starkExAssetId,
        collateralResolution: quoteCoin.starkExResolution,
        feeRate: contract.defaultTakerFeeRate ?? '0.001',
        tickSize: contract.tickSize,
    };
}
export function registerOrderCommand(program) {
    const order = program
        .command('order')
        .description('Order management (requires authentication)');
    // ─── status ───
    order
        .command('status <orderId>')
        .description('Query order status by ID')
        .action(async (orderId, _opts, cmd) => {
        try {
            await init();
            const fmt = getFormat(cmd);
            const data = await client.getOrderById(orderId);
            const d = data;
            output(fmt, data, () => {
                console.log(chalk.bold('Order Details\n'));
                printKeyValue([
                    ['Order ID', String(d.orderId ?? '')],
                    ['Symbol', contractName(String(d.contractId ?? ''))],
                    ['Side', String(d.side ?? '')],
                    ['Type', String(d.type ?? d.orderType ?? '')],
                    ['Price', String(d.price ?? '')],
                    ['Size', String(d.size ?? '')],
                    ['Filled', String(d.filledSize ?? d.cumFilledSize ?? '0')],
                    ['Status', String(d.status ?? '')],
                    ['Created', d.createdTime ? new Date(Number(d.createdTime)).toLocaleString() : ''],
                ]);
            });
        }
        catch (err) {
            handleError(err, getFormat(cmd));
        }
    });
    // ─── cancel ───
    order
        .command('cancel <orderIds>')
        .description('Cancel order(s) by ID (comma-separated for batch)')
        .action(async (orderIds, _opts, cmd) => {
        try {
            await init();
            const fmt = getFormat(cmd);
            const ids = orderIds.split(',').map(id => id.trim()).filter(Boolean);
            const data = await client.cancelOrderById(ids);
            output(fmt, data, () => {
                console.log(chalk.green(`Cancelled ${ids.length} order(s): ${ids.join(', ')}`));
            });
        }
        catch (err) {
            handleError(err, getFormat(cmd));
        }
    });
    // ─── cancel-all ───
    order
        .command('cancel-all')
        .description('Cancel all open orders')
        .option('-s, --symbol <symbol>', 'Cancel only for this symbol')
        .action(async (opts, cmd) => {
        try {
            await init();
            const fmt = getFormat(cmd);
            const contractId = opts.symbol ? resolveSymbol(contracts, opts.symbol)?.contractId : undefined;
            const data = await client.cancelAllOrder(contractId);
            output(fmt, data, () => {
                const scope = opts.symbol ? ` for ${opts.symbol}` : '';
                console.log(chalk.green(`All orders cancelled${scope}`));
            });
        }
        catch (err) {
            handleError(err, getFormat(cmd));
        }
    });
    // ─── max-size ───
    order
        .command('max-size <symbol>')
        .description('Query maximum order size')
        .option('--price <price>', 'Limit price for calculation')
        .action(async (symbol, opts, cmd) => {
        try {
            await init();
            const fmt = getFormat(cmd);
            const contract = resolveSymbol(contracts, symbol);
            if (!contract)
                throw new EdgexError(`Unknown symbol: ${symbol}`);
            const data = await client.getMaxCreateOrderSize(contract.contractId, opts.price);
            const d = data;
            output(fmt, data, () => {
                console.log(chalk.bold(`Max Order Size: ${contract.contractName}\n`));
                printKeyValue([
                    ['Max Buy Size', String(d.maxBuySize ?? d.maxBuyOrderSize ?? 'N/A')],
                    ['Max Sell Size', String(d.maxSellSize ?? d.maxSellOrderSize ?? 'N/A')],
                ]);
            });
        }
        catch (err) {
            handleError(err, getFormat(cmd));
        }
    });
    // ─── cancel-by-client-id ───
    order
        .command('cancel-client <clientOrderIds>')
        .description('Cancel order(s) by client order ID (comma-separated)')
        .action(async (clientOrderIds, _opts, cmd) => {
        try {
            await init();
            const fmt = getFormat(cmd);
            const ids = clientOrderIds.split(',').map(id => id.trim()).filter(Boolean);
            const data = await client.cancelOrderByClientOrderId(ids);
            output(fmt, data, () => {
                console.log(chalk.green(`Cancelled ${ids.length} order(s) by client ID: ${ids.join(', ')}`));
            });
        }
        catch (err) {
            handleError(err, getFormat(cmd));
        }
    });
    // ─── fills ───
    order
        .command('fills')
        .description('Order fill transaction history')
        .option('-s, --symbol <symbol>', 'Filter by symbol')
        .option('-n, --size <size>', 'Page size', '20')
        .action(async (opts, cmd) => {
        try {
            await init();
            const fmt = getFormat(cmd);
            const filterContractIdList = opts.symbol
                ? [resolveSymbol(contracts, opts.symbol)?.contractId].filter(Boolean)
                : undefined;
            const data = await client.getHistoryOrderFillTransactionPage({
                size: opts.size,
                filterContractIdList,
            });
            output(fmt, data, () => {
                const d = data;
                const list = (d.dataList ?? []);
                if (list.length === 0) {
                    console.log(chalk.gray('No fill transactions'));
                    return;
                }
                printTable(['Fill ID', 'Order ID', 'Symbol', 'Side', 'Price', 'Size', 'Fee', 'Time'], list.map(f => [
                    String(f.fillId ?? f.id ?? ''),
                    String(f.orderId ?? ''),
                    contractName(String(f.contractId ?? '')),
                    String(f.side ?? ''),
                    String(f.price ?? ''),
                    String(f.size ?? f.fillSize ?? ''),
                    String(f.fee ?? ''),
                    f.createdTime ? new Date(Number(f.createdTime)).toLocaleString() : '',
                ]));
            });
        }
        catch (err) {
            handleError(err, getFormat(cmd));
        }
    });
    // ─── create ───
    order
        .command('create <symbol> <side> <type> <size>')
        .description('Create order (limit/market)')
        .option('--price <price>', 'Limit price (required for limit orders)')
        .option('--tp <price>', 'Take profit price')
        .option('--sl <price>', 'Stop loss price')
        .option('--client-id <id>', 'Client order ID')
        .option('-y, --yes', 'Skip order confirmation prompt')
        .action(async (symbol, side, type, size, opts, cmd) => {
        try {
            await init();
            const fmt = getFormat(cmd);
            const contract = resolveSymbol(contracts, symbol);
            if (!contract)
                throw new EdgexError(`Unknown symbol: ${symbol}`);
            const sideUpper = side.toUpperCase();
            const typeUpper = type.toUpperCase();
            if (sideUpper !== 'BUY' && sideUpper !== 'SELL') {
                throw new EdgexError('Side must be "buy" or "sell"');
            }
            if (typeUpper !== 'LIMIT' && typeUpper !== 'MARKET') {
                throw new EdgexError('Type must be "limit" or "market"');
            }
            if (typeUpper === 'LIMIT' && !opts.price) {
                throw new EdgexError('--price is required for limit orders');
            }
            // Get oracle price for market orders
            let oraclePrice;
            if (typeUpper === 'MARKET') {
                const tickers = await client.getTicker(contract.contractId);
                if (tickers.length > 0) {
                    oraclePrice = tickers[0].oraclePrice;
                }
            }
            const { orderBody, l2Fields, displayPrice, orderPrice } = buildOrderPayload({
                contract,
                coins,
                starkPrivateKey,
                accountId: client.currentAccountId,
                side: sideUpper,
                type: typeUpper,
                size,
                price: opts.price,
                oraclePrice,
                tp: opts.tp,
                sl: opts.sl,
                clientId: opts.clientId,
            });
            if (!opts.yes) {
                const sideColor = sideUpper === 'BUY' ? chalk.green(sideUpper) : chalk.red(sideUpper);
                const typeColor = typeUpper === 'MARKET' ? chalk.red(typeUpper) : chalk.cyan(typeUpper);
                console.error(chalk.bold('\nOrder Preview:\n'));
                console.error(`  Symbol:  ${contract.contractName}`);
                console.error(`  Side:    ${sideColor}`);
                console.error(`  Type:    ${typeColor}`);
                console.error(`  Size:    ${size}`);
                if (typeUpper === 'MARKET') {
                    console.error(`  Price:   ${chalk.red('MARKET')} (oracle ~${displayPrice})`);
                }
                else {
                    console.error(`  Price:   ${orderPrice}`);
                }
                if (opts.tp)
                    console.error(`  TP:      ${opts.tp}`);
                if (opts.sl)
                    console.error(`  SL:      ${opts.sl}`);
                console.error('');
                if (typeUpper === 'MARKET') {
                    console.error(chalk.yellow('  ⚠  Market orders execute at best available price'));
                }
                const confirmed = await confirmOrder(chalk.bold('  Confirm order? [y/N] '));
                if (!confirmed) {
                    console.error(chalk.yellow('Order cancelled.'));
                    return;
                }
            }
            const data = await client.createOrder(orderBody);
            const d = data;
            output(fmt, data, () => {
                console.log(chalk.green('Order created successfully\n'));
                printKeyValue([
                    ['Order ID', String(d.orderId ?? '')],
                    ['Client Order ID', l2Fields.clientOrderId],
                    ['Symbol', contract.contractName],
                    ['Side', sideUpper],
                    ['Type', typeUpper],
                    ['Size', size],
                    ['Price', opts.price ?? 'MARKET'],
                ]);
            });
        }
        catch (err) {
            handleError(err, getFormat(cmd));
        }
    });
}
//# sourceMappingURL=order.js.map