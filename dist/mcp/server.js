import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { EdgexClient } from '../core/client.js';
import { loadConfig, isTestnet } from '../core/config.js';
import { loadCachedContracts, saveCachedContracts, resolveSymbol, getCachedCoins } from '../core/symbols.js';
import { buildOrderPayload } from '../core/order-service.js';
import { TRADING_RULES, AGENT_GUIDELINES, OUTPUT_SCHEMAS } from './resources.js';
// ─── State ───
let client;
let contracts = [];
let coins = [];
let starkPrivateKey = '';
async function ensureClient() {
    if (!client) {
        const config = await loadConfig();
        client = new EdgexClient(config);
        starkPrivateKey = config.starkPrivateKey ?? '';
    }
    return client;
}
async function ensureContracts() {
    if (contracts.length > 0)
        return contracts;
    const cached = await loadCachedContracts();
    if (cached && cached.length > 0) {
        contracts = cached;
        coins = getCachedCoins() ?? [];
        return contracts;
    }
    const c = await ensureClient();
    const meta = await c.getMetaData();
    contracts = meta.contractList;
    coins = meta.coinList;
    await saveCachedContracts(contracts, coins);
    return contracts;
}
async function resolve(symbol) {
    const list = await ensureContracts();
    const found = resolveSymbol(list, symbol);
    if (!found)
        throw new Error(`Unknown symbol: ${symbol}. Try BTC, ETH, SOL, TSLA, etc.`);
    return found;
}
function textResult(data) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function errorResult(msg) {
    return { content: [{ type: 'text', text: msg }], isError: true };
}
// ─── Kline interval mapping ───
const KLINE_MAP = {
    '1m': 'MINUTE_1', '5m': 'MINUTE_5', '15m': 'MINUTE_15', '30m': 'MINUTE_30',
    '1h': 'HOUR_1', '2h': 'HOUR_2', '4h': 'HOUR_4', '6h': 'HOUR_6',
    '12h': 'HOUR_12', '1d': 'DAY_1', '1w': 'WEEK_1', '1M': 'MONTH_1',
};
// ─── Server Setup ───
const server = new McpServer({ name: 'edgex', version: '0.2.0' }, {
    instructions: `EdgeX MCP server for perpetual contract trading on EdgeX exchange.

Key rules for AI agents:
- CALL edgex_get_auth_status FIRST at the start of every session to verify credentials.
- Call edgex_get_environment to see current baseUrl and whether you are on testnet or mainnet (environment: "testnet" | "mainnet"). Like CLI --testnet, this is determined by EDGEX_TESTNET=1.
- ALWAYS check edgex_get_balances and edgex_get_max_size before placing orders.
- ALWAYS confirm order parameters with the user before calling edgex_place_order.
- For stock contracts (TSLA, AAPL, NVDA, etc.) during market closure: market orders are REJECTED. Use limit orders only.
- All numeric values are returned as strings. Use parseFloat() to parse.
- Funding rate is a decimal: "0.0001" = 0.01%. Positive = longs pay shorts.
- EdgeX uses cross-margin by default. All positions share collateral.
- Oracle Price is used for liquidation, not last traded price.
- Use edgex_run_tests and edgex_list_tests for regression testing.

Read the resources 'edgex://trading-rules' and 'edgex://agent-guidelines' for detailed trading rules and best practices.`,
});
// ═══════════════════════════════════════════
//  RESOURCES — contextual docs for AI agents
// ═══════════════════════════════════════════
server.resource('trading-rules', 'edgex://trading-rules', { description: 'EdgeX trading rules: margin, stock contract restrictions, order types, funding, liquidation, price types', mimeType: 'text/markdown' }, async () => ({
    contents: [{
            uri: 'edgex://trading-rules',
            mimeType: 'text/markdown',
            text: TRADING_RULES,
        }],
}));
server.resource('agent-guidelines', 'edgex://agent-guidelines', { description: 'Best practices and workflows for AI agents using EdgeX MCP tools', mimeType: 'text/markdown' }, async () => ({
    contents: [{
            uri: 'edgex://agent-guidelines',
            mimeType: 'text/markdown',
            text: AGENT_GUIDELINES,
        }],
}));
server.resource('output-schemas', 'edgex://output-schemas', { description: 'JSON response schemas for all EdgeX MCP tools', mimeType: 'text/markdown' }, async () => ({
    contents: [{
            uri: 'edgex://output-schemas',
            mimeType: 'text/markdown',
            text: OUTPUT_SCHEMAS,
        }],
}));
// ═══════════════════════════════════════════
//  ENVIRONMENT (testnet vs mainnet)
// ═══════════════════════════════════════════
server.tool('edgex_get_environment', 'Get current MCP environment: baseUrl, isTestnet, and environment label. Use this to confirm whether you are connected to testnet or mainnet before trading.', {}, async () => {
    try {
        const config = await loadConfig();
        const testnet = isTestnet();
        const env = {
            baseUrl: config.baseUrl,
            wsUrl: config.wsUrl,
            isTestnet: testnet,
            environment: testnet ? 'testnet' : 'mainnet',
        };
        return textResult(env);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
// ═══════════════════════════════════════════
//  AUTH STATUS (call first)
// ═══════════════════════════════════════════
server.tool('edgex_get_auth_status', 'Check if EdgeX credentials are configured. CALL THIS FIRST at the start of every session. Returns authentication status and setup instructions if not configured.', {}, async () => {
    try {
        const config = await loadConfig();
        const hasAccountId = !!config.accountId;
        const hasPrivateKey = !!config.starkPrivateKey;
        const authenticated = hasAccountId && hasPrivateKey;
        const result = {
            authenticated,
            accountId: hasAccountId ? config.accountId : null,
            environment: isTestnet() ? 'testnet' : 'mainnet',
            baseUrl: config.baseUrl,
        };
        if (!authenticated) {
            result.setupInstructions = [
                'Run "edgex setup" to configure credentials interactively.',
                'Or set environment variables: EDGEX_ACCOUNT_ID and EDGEX_STARK_PRIVATE_KEY.',
                'For testnet, also set EDGEX_TESTNET=1.',
            ];
        }
        return textResult(result);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
// ═══════════════════════════════════════════
//  PUBLIC MARKET DATA TOOLS
// ═══════════════════════════════════════════
server.tool('edgex_get_ticker', 'Get 24h ticker: price, volume, open interest, funding rate. Omit symbol to get all contracts (uses cached contract list, may return subset).', { symbol: z.string().optional().describe('e.g. BTC, ETH, SOL, TSLA') }, async ({ symbol }) => {
    try {
        const c = await ensureClient();
        if (symbol) {
            const contract = await resolve(symbol);
            const data = await c.getTicker(contract.contractId);
            return textResult(data);
        }
        let data = await c.getTicker(undefined);
        if (Array.isArray(data) && data.length > 0)
            return textResult(data);
        const list = await ensureContracts();
        const maxAll = 30;
        const tickers = [];
        for (let i = 0; i < Math.min(list.length, maxAll); i++) {
            const row = await c.getTicker(list[i].contractId);
            if (Array.isArray(row) && row[0])
                tickers.push(row[0]);
        }
        return textResult(tickers);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_get_depth', 'Get order book depth (bids and asks) for a contract.', {
    symbol: z.string().describe('e.g. BTC, ETH, SOL'),
    level: z.enum(['15', '200']).optional().describe('Depth levels (default: 15)'),
}, async ({ symbol, level }) => {
    try {
        const c = await ensureClient();
        const contract = await resolve(symbol);
        const data = await c.getDepth(contract.contractId, level ?? '15');
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_get_kline', 'Get candlestick/kline data for technical analysis.', {
    symbol: z.string().describe('e.g. BTC, ETH, SOL'),
    interval: z.enum(['1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w', '1M']).optional().describe('Candle interval (default: 1h)'),
    count: z.number().int().min(1).max(500).optional().describe('Number of candles (default: 100, max: 500)'),
}, async ({ symbol, interval, count }) => {
    try {
        const c = await ensureClient();
        const contract = await resolve(symbol);
        const klineType = KLINE_MAP[interval ?? '1h'] ?? 'HOUR_1';
        const data = await c.getKline(contract.contractId, klineType, String(count ?? 100));
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_get_funding', 'Get current and predicted funding rate. Positive = longs pay shorts. Omit symbol for first N contracts from cache.', { symbol: z.string().optional().describe('e.g. BTC, ETH, SOL. Omit for all.') }, async ({ symbol }) => {
    try {
        const c = await ensureClient();
        if (symbol) {
            const contract = await resolve(symbol);
            const data = await c.getLatestFundingRate(contract.contractId);
            return textResult(data);
        }
        let data = await c.getLatestFundingRate(undefined);
        if (Array.isArray(data) && data.length > 0)
            return textResult(data);
        const list = await ensureContracts();
        const maxAll = 30;
        const out = [];
        for (let i = 0; i < Math.min(list.length, maxAll); i++) {
            const row = await c.getLatestFundingRate(list[i].contractId);
            if (Array.isArray(row) && row[0])
                out.push(row[0]);
        }
        return textResult(out);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_get_ratio', 'Get long/short ratio aggregated from multiple exchanges (Binance, OKX, Bybit, etc.).', { symbol: z.string().optional().describe('e.g. BTC, ETH, SOL') }, async ({ symbol }) => {
    try {
        const c = await ensureClient();
        let contractId;
        if (symbol) {
            const contract = await resolve(symbol);
            contractId = contract.contractId;
        }
        const data = await c.getLongShortRatio(contractId);
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_get_summary', 'Get market-wide volume and trading summary.', {}, async () => {
    try {
        const c = await ensureClient();
        const data = await c.getTickerSummary();
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
// ═══════════════════════════════════════════
//  ACCOUNT TOOLS (requires auth)
// ═══════════════════════════════════════════
server.tool('edgex_get_balances', 'Get account balances, positions, and equity. Requires EDGEX_ACCOUNT_ID and EDGEX_STARK_PRIVATE_KEY.', {}, async () => {
    try {
        const c = await ensureClient();
        const data = await c.getAccountAsset();
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_get_positions', 'Get open positions with unrealized PnL. Returns empty array if no positions.', {}, async () => {
    try {
        const c = await ensureClient();
        const data = await c.getAccountAsset();
        return textResult(data.positionList ?? []);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_get_orders', 'Get active/pending orders.', { symbol: z.string().optional().describe('Filter by symbol') }, async ({ symbol }) => {
    try {
        const c = await ensureClient();
        let contractId;
        if (symbol) {
            const contract = await resolve(symbol);
            contractId = contract.contractId;
        }
        const data = await c.getActiveOrders(contractId);
        return textResult(data.dataList ?? []);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_get_order_status', 'Get status of a specific order by ID.', { orderId: z.string().describe('The order ID to query') }, async ({ orderId }) => {
    try {
        const c = await ensureClient();
        const data = await c.getOrderById(orderId);
        let order = null;
        if (Array.isArray(data)) {
            order = data.length > 0 ? data[0] : null;
        }
        else if (data != null && typeof data === 'object') {
            const obj = data;
            if ('order' in obj && obj.order != null && typeof obj.order === 'object') {
                order = obj.order;
            }
            else if ('data' in obj && obj.data != null && typeof obj.data === 'object') {
                order = obj.data;
            }
            else if ('id' in obj || 'orderId' in obj || 'status' in obj) {
                order = data;
            }
            else {
                order = data;
            }
        }
        if (order == null) {
            return textResult({ orderId, found: false, message: 'Order not found or no data returned' });
        }
        return textResult(order);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_get_max_size', 'Get maximum order size for a contract given current balance and leverage.', { symbol: z.string().describe('e.g. BTC, ETH, SOL') }, async ({ symbol }) => {
    try {
        const c = await ensureClient();
        const contract = await resolve(symbol);
        const data = await c.getMaxCreateOrderSize(contract.contractId);
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_set_leverage', 'Set leverage for a contract. EdgeX uses cross-margin mode.', {
    symbol: z.string().describe('e.g. BTC, ETH, SOL'),
    leverage: z.number().int().min(1).max(100).describe('Leverage multiplier (1-100)'),
}, async ({ symbol, leverage }) => {
    try {
        const c = await ensureClient();
        const contract = await resolve(symbol);
        const data = await c.updateLeverageSetting(contract.contractId, String(leverage));
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
// ═══════════════════════════════════════════
//  TRADING TOOLS (requires auth)
// ═══════════════════════════════════════════
server.tool('edgex_place_order', 'Place a limit or market order. For stock contracts during market closure, only limit orders are allowed. ALWAYS confirm with the user before calling this tool.', {
    symbol: z.string().describe('e.g. BTC, ETH, SOL, TSLA'),
    side: z.enum(['buy', 'sell']).describe('Order side'),
    type: z.enum(['limit', 'market']).describe('Order type'),
    size: z.string().describe('Order size in base asset (e.g. "0.01" for BTC)'),
    price: z.string().optional().describe('Limit price (required for limit orders)'),
    tp: z.string().optional().describe('Take-profit trigger price'),
    sl: z.string().optional().describe('Stop-loss trigger price'),
}, async ({ symbol, side, type, size, price, tp, sl }) => {
    try {
        if (type === 'limit' && !price) {
            return errorResult('Price is required for limit orders. Use the price parameter.');
        }
        const c = await ensureClient();
        await ensureContracts();
        const contract = await resolve(symbol);
        const sideUpper = side.toUpperCase();
        const typeUpper = type.toUpperCase();
        let oraclePrice;
        if (type === 'market') {
            const tickers = await c.getTicker(contract.contractId);
            oraclePrice = tickers[0]?.oraclePrice ?? '0';
        }
        const accountId = c.currentAccountId;
        if (!accountId) {
            return errorResult('Account ID is not configured. Run edgex setup first.');
        }
        const { orderBody } = buildOrderPayload({
            contract,
            coins: coins.length > 0 ? coins : getCachedCoins() ?? [],
            starkPrivateKey,
            accountId,
            side: sideUpper,
            type: typeUpper,
            size,
            price,
            oraclePrice,
            tp,
            sl,
        });
        const data = await c.createOrder(orderBody);
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_cancel_order', 'Cancel one or more orders by ID.', { orderIds: z.array(z.string()).min(1).describe('Array of order IDs to cancel') }, async ({ orderIds }) => {
    try {
        const c = await ensureClient();
        const data = await c.cancelOrderById(orderIds);
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_cancel_all_orders', 'Cancel all active orders, optionally filtered by symbol.', { symbol: z.string().optional().describe('Only cancel orders for this symbol') }, async ({ symbol }) => {
    try {
        const c = await ensureClient();
        let contractId;
        if (symbol) {
            const contract = await resolve(symbol);
            contractId = contract.contractId;
        }
        const data = await c.cancelAllOrder(contractId);
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
// ═══════════════════════════════════════════
//  ACCOUNT EXTENDED TOOLS
// ═══════════════════════════════════════════
server.tool('edgex_get_account_info', 'Get full account details including settings, leverage, and registration info.', {}, async () => {
    try {
        const c = await ensureClient();
        const data = await c.getAccountById();
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_get_position_transactions', 'Get position transaction history (opens, closes, liquidations).', {
    symbol: z.string().optional().describe('Filter by symbol'),
    size: z.string().optional().describe('Page size (default: 20)'),
}, async ({ symbol, size }) => {
    try {
        const c = await ensureClient();
        let filterContractIdList;
        if (symbol) {
            const contract = await resolve(symbol);
            filterContractIdList = [contract.contractId];
        }
        const data = await c.getPositionTransactionPage({ size: size ?? '20', filterContractIdList });
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_get_collateral_transactions', 'Get collateral transaction history (deposits, withdrawals, funding).', { size: z.string().optional().describe('Page size (default: 20)') }, async ({ size }) => {
    try {
        const c = await ensureClient();
        const data = await c.getCollateralTransactionPage({ size: size ?? '20' });
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_get_position_terms', 'Get closed position history (position terms).', {
    symbol: z.string().optional().describe('Filter by symbol'),
    size: z.string().optional().describe('Page size (default: 20)'),
}, async ({ symbol, size }) => {
    try {
        const c = await ensureClient();
        let filterContractIdList;
        if (symbol) {
            const contract = await resolve(symbol);
            filterContractIdList = [contract.contractId];
        }
        const data = await c.getPositionTermPage({ size: size ?? '20', filterContractIdList });
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_get_deleverage_light', 'Get account deleverage light status — indicates risk of auto-deleveraging.', {}, async () => {
    try {
        const c = await ensureClient();
        const data = await c.getAccountDeleverageLight();
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
// ═══════════════════════════════════════════
//  ORDER EXTENDED TOOLS
// ═══════════════════════════════════════════
server.tool('edgex_get_fill_history', 'Get order fill/trade history.', {
    symbol: z.string().optional().describe('Filter by symbol'),
    size: z.string().optional().describe('Page size (default: 20)'),
}, async ({ symbol, size }) => {
    try {
        const c = await ensureClient();
        let filterContractIdList;
        if (symbol) {
            const contract = await resolve(symbol);
            filterContractIdList = [contract.contractId];
        }
        const data = await c.getHistoryOrderFillTransactionPage({ size: size ?? '20', filterContractIdList });
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_cancel_order_by_client_id', 'Cancel order(s) by client order ID.', { clientOrderIds: z.array(z.string()).min(1).describe('Array of client order IDs to cancel') }, async ({ clientOrderIds }) => {
    try {
        const c = await ensureClient();
        const data = await c.cancelOrderByClientOrderId(clientOrderIds);
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
// ═══════════════════════════════════════════
//  TRANSFER TOOLS
// ═══════════════════════════════════════════
server.tool('edgex_get_transfer_available', 'Get available amount for transfer out.', { coinId: z.string().describe('Coin ID to check') }, async ({ coinId }) => {
    try {
        const c = await ensureClient();
        const data = await c.getTransferOutAvailableAmount(coinId);
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_get_transfer_out_history', 'Get transfer out history.', { size: z.string().optional().describe('Page size (default: 10)') }, async ({ size }) => {
    try {
        const c = await ensureClient();
        const data = await c.getActiveTransferOut({ size: size ?? '10' });
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_get_transfer_in_history', 'Get transfer in history.', { size: z.string().optional().describe('Page size (default: 10)') }, async ({ size }) => {
    try {
        const c = await ensureClient();
        const data = await c.getActiveTransferIn({ size: size ?? '10' });
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
// ═══════════════════════════════════════════
//  ASSET TOOLS
// ═══════════════════════════════════════════
server.tool('edgex_get_asset_orders', 'Get asset order history (deposits, withdrawals, transfers).', { size: z.string().optional().describe('Page size (default: 10)') }, async ({ size }) => {
    try {
        const c = await ensureClient();
        const data = await c.getAssetOrdersPage({ size: size ?? '10' });
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_get_withdraw_history', 'Get withdrawal records.', { size: z.string().optional().describe('Page size (default: 10)') }, async ({ size }) => {
    try {
        const c = await ensureClient();
        const data = await c.getNormalWithdrawById({ size: size ?? '10' });
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_get_withdrawable_amount', 'Get withdrawable amount for a coin address.', { address: z.string().describe('Coin contract address') }, async ({ address }) => {
    try {
        const c = await ensureClient();
        const data = await c.getNormalWithdrawableAmount(address);
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_get_coin_rate', 'Get coin exchange rate.', {
    chainId: z.string().optional().describe('Chain ID (default: 1)'),
    coin: z.string().optional().describe('Coin contract address'),
}, async ({ chainId, coin }) => {
    try {
        const c = await ensureClient();
        const data = await c.getCoinRate(chainId ?? '1', coin ?? '0xdac17f958d2ee523a2206206994597c13d831ec7');
        return textResult(data);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
// ═══════════════════════════════════════════
//  ON-CHAIN DEPOSIT TRACKING
// ═══════════════════════════════════════════
server.tool('edgex_get_deposit_status', 'Track deposit status by tx hash using on-chain RPC queries. Works for cross-chain deposits (Arb/Eth/BSC → EdgeX) and direct Edge chain deposits. No backend API needed. Returns status: not_found, pending, failed, confirmed (source chain ok, awaiting relay), or credited (Edge chain confirmed).', {
    txHash: z.string().describe('Transaction hash from the source chain deposit'),
    chain: z.string().optional().describe('Only query a specific chain: edge, arb, eth, bsc. Omit to auto-detect.'),
}, async ({ txHash, chain }) => {
    try {
        const { trackDeposit, getDefaultChains } = await import('../core/deposit-tracker.js');
        const config = await loadConfig();
        let chains = getDefaultChains(config.edgeChainRpcUrl);
        if (chain) {
            const filter = chain.toLowerCase();
            const map = {
                edge: 'Edge Chain', arb: 'Arbitrum', arbitrum: 'Arbitrum',
                eth: 'Ethereum', ethereum: 'Ethereum', bsc: 'BSC',
            };
            const target = map[filter];
            if (target)
                chains = chains.filter(c => c.name === target);
        }
        const result = await trackDeposit(txHash, chains);
        return textResult(result);
    }
    catch (e) {
        return errorResult(e.message);
    }
});
// ═══════════════════════════════════════════
//  REGRESSION TEST TOOLS
// ═══════════════════════════════════════════
server.tool('edgex_list_tests', 'List available regression test suites and their cases.', { suite: z.string().optional().describe('Suite name (e.g. tc_acc). Omit to list all suites.') }, async ({ suite }) => {
    try {
        const { execSync } = await import('node:child_process');
        const cliPath = new URL('../../dist/index.js', import.meta.url).pathname;
        const args = suite ? `test list ${suite} --json` : 'test list --json';
        const output = execSync(`node ${cliPath} ${args}`, { encoding: 'utf-8', timeout: 10000 });
        return textResult(JSON.parse(output));
    }
    catch (e) {
        return errorResult(e.message);
    }
});
server.tool('edgex_run_tests', 'Run regression test suites. Returns structured JSON results with pass/fail per case. Default suites: tc_acc, tc_trd, tc_api, tc_sub.', {
    suites: z.array(z.string()).optional().describe('Suite names to run (e.g. ["tc_acc", "tc_trd"]). Omit for defaults. Use ["all"] for full regression.'),
    env: z.enum(['mainnet', 'testnet']).optional().describe('Environment (default: current)'),
}, async ({ suites, env }) => {
    try {
        const { execSync } = await import('node:child_process');
        const cliPath = new URL('../../dist/index.js', import.meta.url).pathname;
        const suiteArgs = suites && suites.length > 0 ? suites.join(' ') : '';
        const envFlag = env === 'testnet' ? ' --testnet' : '';
        const cmd = `node ${cliPath} test run ${suiteArgs} --json${envFlag}`;
        const output = execSync(cmd, { encoding: 'utf-8', timeout: 120000 });
        return textResult(JSON.parse(output));
    }
    catch (e) {
        // Test failures return exit code 1 but still produce valid JSON on stdout
        if (e.stdout) {
            try {
                return textResult(JSON.parse(e.stdout));
            }
            catch { }
        }
        return errorResult(e.message);
    }
});
// ─── Start Server ───
export function startMcpServer() {
    const transport = new StdioServerTransport();
    server.connect(transport).catch((err) => {
        process.stderr.write(`Fatal: ${err.message}\n`);
        process.exit(1);
    });
}
//# sourceMappingURL=server.js.map