import { rateLimit } from './rate-limiter.js';
import { signRequest } from './auth.js';
import { getDispatcher } from './proxy.js';
import { ApiError, ConfigError } from '../utils/errors.js';
export class EdgexClient {
    baseUrl;
    accountId;
    starkPrivateKey;
    constructor(config) {
        this.baseUrl = config.baseUrl.replace(/\/$/, '');
        this.accountId = config.accountId;
        this.starkPrivateKey = config.starkPrivateKey;
    }
    requireAuth() {
        if (!this.accountId || !this.starkPrivateKey) {
            throw new ConfigError('Authentication required. Run "edgex setup" or set EDGEX_ACCOUNT_ID and EDGEX_STARK_PRIVATE_KEY.');
        }
    }
    // ─── Public request (no auth) ───
    async request(method, path, params) {
        await rateLimit();
        let url = `${this.baseUrl}${path}`;
        if (params && method === 'GET') {
            const qs = new URLSearchParams(params).toString();
            if (qs)
                url += `?${qs}`;
        }
        let res;
        try {
            const dispatcher = getDispatcher();
            res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                ...(method === 'POST' && params ? { body: JSON.stringify(params) } : {}),
                ...(dispatcher ? { dispatcher } : {}),
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new ApiError('NETWORK', `Failed to connect to ${this.baseUrl} — ${msg}`);
        }
        if (!res.ok) {
            throw new ApiError(String(res.status), `HTTP ${res.status}: ${res.statusText}`);
        }
        const json = (await res.json());
        if (json.code !== '0' && json.code !== 'SUCCESS') {
            throw new ApiError(json.code, json.msg || 'Unknown API error');
        }
        return json.data;
    }
    // ─── Authenticated request ───
    async authRequest(method, path, params) {
        this.requireAuth();
        await rateLimit();
        const { timestamp, signature } = signRequest(method, path, this.starkPrivateKey, params);
        const headers = {
            'Content-Type': 'application/json',
            'X-edgeX-Api-Timestamp': timestamp,
            'X-edgeX-Api-Signature': signature,
        };
        let url = `${this.baseUrl}${path}`;
        const dispatcher = getDispatcher();
        const init = { method, headers, ...(dispatcher ? { dispatcher } : {}) };
        if (method === 'GET' && params && Object.keys(params).length > 0) {
            const qs = Object.keys(params)
                .sort()
                .map(k => `${k}=${encodeURIComponent(String(params[k]))}`)
                .join('&');
            url += `?${qs}`;
        }
        else if (method === 'POST' && params) {
            init.body = JSON.stringify(params);
        }
        let res;
        try {
            res = await fetch(url, init);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new ApiError('NETWORK', `Failed to connect to ${this.baseUrl} — ${msg}`);
        }
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new ApiError(String(res.status), `HTTP ${res.status}: ${res.statusText} ${text}`);
        }
        const json = (await res.json());
        if (json.code !== '0' && json.code !== 'SUCCESS') {
            throw new ApiError(json.code, json.msg || 'Unknown API error');
        }
        return json.data;
    }
    get currentAccountId() {
        return this.accountId;
    }
    // ─── Public: Metadata ───
    async getMetaData() {
        return this.request('GET', '/api/v1/public/meta/getMetaData');
    }
    async getServerTime() {
        return this.request('GET', '/api/v1/public/meta/getServerTime');
    }
    // ─── Public: Quote ───
    async getTicker(contractId) {
        const params = {};
        if (contractId)
            params.contractId = contractId;
        return this.request('GET', '/api/v1/public/quote/getTicker', params);
    }
    async getDepth(contractId, level = '15') {
        const data = await this.request('GET', '/api/v1/public/quote/getDepth', {
            contractId,
            level,
        });
        return Array.isArray(data) ? data[0] : data;
    }
    async getKline(contractId, klineType, size = '100') {
        return this.request('GET', '/api/v1/public/quote/getKline', {
            contractId,
            klineType,
            size,
            priceType: 'LAST_PRICE',
        });
    }
    async getTickerSummary() {
        return this.request('GET', '/api/v1/public/quote/getTicketSummary');
    }
    async getLongShortRatio(contractId) {
        const params = {};
        if (contractId)
            params.contractId = contractId;
        return this.request('GET', '/api/v1/public/quote/getExchangeLongShortRatio', params);
    }
    // ─── Public: Funding ───
    async getLatestFundingRate(contractId) {
        const params = {};
        if (contractId)
            params.contractId = contractId;
        return this.request('GET', '/api/v1/public/funding/getLatestFundingRate', params);
    }
    async getFundingRatePage(contractId, page = '1', limit = '20') {
        return this.request('GET', '/api/v1/public/funding/getFundingRatePage', {
            contractId,
            page,
            limit,
        });
    }
    // ─── Private: Account ───
    async getAccountAsset() {
        return this.authRequest('GET', '/api/v1/private/account/getAccountAsset', {
            accountId: this.accountId,
        });
    }
    async getAccountById() {
        return this.authRequest('GET', '/api/v1/private/account/getAccountById', {
            accountId: this.accountId,
        });
    }
    async updateLeverageSetting(contractId, leverage) {
        return this.authRequest('POST', '/api/v1/private/account/updateLeverageSetting', {
            accountId: this.accountId,
            contractId,
            leverage,
        });
    }
    // ─── Private: Orders ───
    async getActiveOrders(contractId, size = '50') {
        const params = {
            accountId: this.accountId,
            size,
        };
        if (contractId)
            params.contractId = contractId;
        return this.authRequest('GET', '/api/v1/private/order/getActiveOrderPage', params);
    }
    async getOrderById(orderId) {
        return this.authRequest('GET', '/api/v1/private/order/getOrderById', {
            accountId: this.accountId,
            orderId,
        });
    }
    async getOrderByClientOrderId(clientOrderId) {
        return this.authRequest('GET', '/api/v1/private/order/getOrderByClientOrderId', {
            accountId: this.accountId,
            clientOrderId,
        });
    }
    async cancelOrderById(orderIds) {
        return this.authRequest('POST', '/api/v1/private/order/cancelOrderById', {
            accountId: this.accountId,
            orderIdList: orderIds,
        });
    }
    async cancelAllOrder(contractId) {
        const params = {
            accountId: this.accountId,
        };
        if (contractId)
            params.contractId = contractId;
        return this.authRequest('POST', '/api/v1/private/order/cancelAllOrder', params);
    }
    async createOrder(orderParams) {
        return this.authRequest('POST', '/api/v1/private/order/createOrder', {
            ...orderParams,
            accountId: this.accountId,
        });
    }
    async getMaxCreateOrderSize(contractId, price) {
        const params = {
            accountId: this.accountId,
            contractId,
        };
        if (price)
            params.price = price;
        return this.authRequest('POST', '/api/v1/private/order/getMaxCreateOrderSize', params);
    }
    // ─── Private: Order (extended) ───
    async cancelOrderByClientOrderId(clientOrderIds) {
        return this.authRequest('POST', '/api/v1/private/order/cancelOrderByClientOrderId', {
            accountId: this.accountId,
            clientOrderIdList: clientOrderIds,
        });
    }
    async getHistoryOrderFillTransactionPage(opts) {
        const params = {
            accountId: this.accountId,
        };
        if (opts?.size)
            params.size = opts.size;
        if (opts?.offsetData)
            params.offsetData = opts.offsetData;
        if (opts?.filterContractIdList?.length)
            params.filterContractIdList = opts.filterContractIdList.join(',');
        if (opts?.filterOrderIdList?.length)
            params.filterOrderIdList = opts.filterOrderIdList.join(',');
        if (opts?.filterStartCreatedTimeInclusive)
            params.filterStartCreatedTimeInclusive = opts.filterStartCreatedTimeInclusive;
        if (opts?.filterEndCreatedTimeExclusive)
            params.filterEndCreatedTimeExclusive = opts.filterEndCreatedTimeExclusive;
        return this.authRequest('GET', '/api/v1/private/order/getHistoryOrderFillTransactionPage', params);
    }
    // ─── Private: Account (extended) ───
    async getPositionTransactionPage(opts) {
        const params = {
            accountId: this.accountId,
        };
        if (opts?.size)
            params.size = opts.size;
        if (opts?.offsetData)
            params.offsetData = opts.offsetData;
        if (opts?.filterContractIdList?.length)
            params.filterContractIdList = opts.filterContractIdList.join(',');
        if (opts?.filterStartCreatedTimeInclusive)
            params.filterStartCreatedTimeInclusive = opts.filterStartCreatedTimeInclusive;
        if (opts?.filterEndCreatedTimeExclusive)
            params.filterEndCreatedTimeExclusive = opts.filterEndCreatedTimeExclusive;
        return this.authRequest('GET', '/api/v1/private/account/getPositionTransactionPage', params);
    }
    async getCollateralTransactionPage(opts) {
        const params = {
            accountId: this.accountId,
        };
        if (opts?.size)
            params.size = opts.size;
        if (opts?.offsetData)
            params.offsetData = opts.offsetData;
        if (opts?.filterStartCreatedTimeInclusive)
            params.filterStartCreatedTimeInclusive = opts.filterStartCreatedTimeInclusive;
        if (opts?.filterEndCreatedTimeExclusive)
            params.filterEndCreatedTimeExclusive = opts.filterEndCreatedTimeExclusive;
        return this.authRequest('GET', '/api/v1/private/account/getCollateralTransactionPage', params);
    }
    async getPositionTermPage(opts) {
        const params = {
            accountId: this.accountId,
        };
        if (opts?.size)
            params.size = opts.size;
        if (opts?.offsetData)
            params.offsetData = opts.offsetData;
        if (opts?.filterContractIdList?.length)
            params.filterContractIdList = opts.filterContractIdList.join(',');
        if (opts?.filterStartCreatedTimeInclusive)
            params.filterStartCreatedTimeInclusive = opts.filterStartCreatedTimeInclusive;
        if (opts?.filterEndCreatedTimeExclusive)
            params.filterEndCreatedTimeExclusive = opts.filterEndCreatedTimeExclusive;
        return this.authRequest('GET', '/api/v1/private/account/getPositionTermPage', params);
    }
    async getAccountAssetSnapshotPage(opts) {
        const params = {
            accountId: this.accountId,
        };
        if (opts?.size)
            params.size = opts.size;
        if (opts?.offsetData)
            params.offsetData = opts.offsetData;
        if (opts?.filterStartCreatedTimeInclusive)
            params.filterStartCreatedTimeInclusive = opts.filterStartCreatedTimeInclusive;
        if (opts?.filterEndCreatedTimeExclusive)
            params.filterEndCreatedTimeExclusive = opts.filterEndCreatedTimeExclusive;
        return this.authRequest('GET', '/api/v1/private/account/getAccountAssetSnapshotPage', params);
    }
    async getPositionTransactionById(transactionIds) {
        return this.authRequest('GET', '/api/v1/private/account/getPositionTransactionById', {
            accountId: this.accountId,
            transactionIdList: transactionIds.join(','),
        });
    }
    async getCollateralTransactionById(transactionIds) {
        return this.authRequest('GET', '/api/v1/private/account/getCollateralTransactionById', {
            accountId: this.accountId,
            transactionIdList: transactionIds.join(','),
        });
    }
    async getAccountDeleverageLight() {
        return this.authRequest('GET', '/api/v1/private/account/getAccountDeleverageLight', {
            accountId: this.accountId,
        });
    }
    async registerAccount(l2Key, l2KeyYCoordinate, clientAccountId) {
        return this.authRequest('POST', '/api/v1/private/account/registerAccount', {
            accountId: this.accountId,
            l2Key,
            l2KeyYCoordinate,
            clientAccountId,
        });
    }
    // ─── Private: Transfer ───
    async getTransferOutById(transferIds) {
        return this.authRequest('GET', '/api/v1/private/transfer/getTransferOutById', {
            accountId: this.accountId,
            transferIdList: transferIds.join(','),
        });
    }
    async getTransferInById(transferIds) {
        return this.authRequest('GET', '/api/v1/private/transfer/getTransferInById', {
            accountId: this.accountId,
            transferIdList: transferIds.join(','),
        });
    }
    async getTransferOutAvailableAmount(coinId) {
        return this.authRequest('GET', '/api/v1/private/transfer/getTransferOutAvailableAmount', {
            accountId: this.accountId,
            coinId,
        });
    }
    async createTransferOut(body) {
        return this.authRequest('POST', '/api/v1/private/transfer/createTransferOut', {
            ...body,
            accountId: this.accountId,
        });
    }
    async getActiveTransferOut(opts) {
        const params = {
            accountId: this.accountId,
        };
        if (opts?.size)
            params.size = opts.size;
        if (opts?.offsetData)
            params.offsetData = opts.offsetData;
        if (opts?.filterCoinIdList?.length)
            params.filterCoinIdList = opts.filterCoinIdList.join(',');
        if (opts?.filterStatusList?.length)
            params.filterStatusList = opts.filterStatusList.join(',');
        if (opts?.filterStartCreatedTimeInclusive)
            params.filterStartCreatedTimeInclusive = opts.filterStartCreatedTimeInclusive;
        if (opts?.filterEndCreatedTimeExclusive)
            params.filterEndCreatedTimeExclusive = opts.filterEndCreatedTimeExclusive;
        return this.authRequest('GET', '/api/v1/private/transfer/getActiveTransferOut', params);
    }
    async getActiveTransferIn(opts) {
        const params = {
            accountId: this.accountId,
        };
        if (opts?.size)
            params.size = opts.size;
        if (opts?.offsetData)
            params.offsetData = opts.offsetData;
        if (opts?.filterCoinIdList?.length)
            params.filterCoinIdList = opts.filterCoinIdList.join(',');
        if (opts?.filterStatusList?.length)
            params.filterStatusList = opts.filterStatusList.join(',');
        if (opts?.filterStartCreatedTimeInclusive)
            params.filterStartCreatedTimeInclusive = opts.filterStartCreatedTimeInclusive;
        if (opts?.filterEndCreatedTimeExclusive)
            params.filterEndCreatedTimeExclusive = opts.filterEndCreatedTimeExclusive;
        return this.authRequest('GET', '/api/v1/private/transfer/getActiveTransferIn', params);
    }
    // ─── Private: Asset ───
    async getAssetOrdersPage(opts) {
        const params = {
            accountId: this.accountId,
        };
        if (opts?.size)
            params.size = opts.size;
        if (opts?.offsetData)
            params.offsetData = opts.offsetData;
        if (opts?.filterCoinIdList?.length)
            params.filterCoinIdList = opts.filterCoinIdList.join(',');
        if (opts?.filterStartCreatedTimeInclusive)
            params.filterStartCreatedTimeInclusive = opts.filterStartCreatedTimeInclusive;
        if (opts?.filterEndCreatedTimeExclusive)
            params.filterEndCreatedTimeExclusive = opts.filterEndCreatedTimeExclusive;
        return this.authRequest('GET', '/api/v1/private/assets/getAllOrdersPage', params);
    }
    async getCoinRate(chainId = '1', coin = '0xdac17f958d2ee523a2206206994597c13d831ec7') {
        return this.authRequest('GET', '/api/v1/private/assets/getCoinRate', {
            accountId: this.accountId,
            chainId,
            coin,
        });
    }
    async createNormalWithdraw(body) {
        return this.authRequest('POST', '/api/v1/private/assets/createNormalWithdraw', {
            ...body,
            accountId: this.accountId,
        });
    }
    async getNormalWithdrawById(opts) {
        const params = {
            accountId: this.accountId,
        };
        if (opts?.size)
            params.size = opts.size;
        if (opts?.offsetData)
            params.offsetData = opts.offsetData;
        if (opts?.filterCoinIdList?.length)
            params.filterCoinIdList = opts.filterCoinIdList.join(',');
        if (opts?.filterStatusList?.length)
            params.filterStatusList = opts.filterStatusList.join(',');
        if (opts?.filterStartCreatedTimeInclusive)
            params.filterStartCreatedTimeInclusive = opts.filterStartCreatedTimeInclusive;
        if (opts?.filterEndCreatedTimeExclusive)
            params.filterEndCreatedTimeExclusive = opts.filterEndCreatedTimeExclusive;
        return this.authRequest('GET', '/api/v1/private/assets/getNormalWithdrawById', params);
    }
    async getNormalWithdrawableAmount(address) {
        return this.authRequest('GET', '/api/v1/private/assets/getNormalWithdrawableAmount', {
            accountId: this.accountId,
            address,
        });
    }
    // ─── Public: Quote (extended) ───
    async getMultiContractKline(contractIdList, interval, limit = '1') {
        return this.request('GET', '/api/v1/public/quote/getMultiContractKline', {
            contractIdList: contractIdList.join(','),
            interval,
            limit,
        });
    }
}
//# sourceMappingURL=client.js.map