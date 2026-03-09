import type {
  ApiResponse,
  ContractMeta,
  CoinMeta,
  Ticker,
  Depth,
  KlineResponse,
  FundingRate,
  LongShortRatioResponse,
  AccountAsset,
  Order,
  EdgexConfig,
} from './types.js';
import { rateLimit } from './rate-limiter.js';
import { signRequest } from './auth.js';
import { getDispatcher } from './proxy.js';
import { ApiError, ConfigError } from '../utils/errors.js';

export class EdgexClient {
  private baseUrl: string;
  private accountId?: string;
  private starkPrivateKey?: string;

  constructor(config: EdgexConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.accountId = config.accountId;
    this.starkPrivateKey = config.starkPrivateKey;
  }

  private requireAuth(): void {
    if (!this.accountId || !this.starkPrivateKey) {
      throw new ConfigError(
        'Authentication required. Run "edgex setup" or set EDGEX_ACCOUNT_ID and EDGEX_STARK_PRIVATE_KEY.',
      );
    }
  }

  // ─── Public request (no auth) ───

  private async request<T>(method: string, path: string, params?: Record<string, string>): Promise<T> {
    await rateLimit();

    let url = `${this.baseUrl}${path}`;
    if (params && method === 'GET') {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += `?${qs}`;
    }

    let res: Response;
    try {
      const dispatcher = getDispatcher();
      res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(method === 'POST' && params ? { body: JSON.stringify(params) } : {}),
        ...(dispatcher ? { dispatcher } : {}),
      } as RequestInit);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiError('NETWORK', `Failed to connect to ${this.baseUrl} — ${msg}`);
    }

    if (!res.ok) {
      throw new ApiError(String(res.status), `HTTP ${res.status}: ${res.statusText}`);
    }

    const json = (await res.json()) as ApiResponse<T>;
    if (json.code !== '0' && json.code !== 'SUCCESS') {
      throw new ApiError(json.code, json.msg || 'Unknown API error');
    }

    return json.data;
  }

  // ─── Authenticated request ───

  private async authRequest<T>(
    method: string,
    path: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    this.requireAuth();
    await rateLimit();

    const { timestamp, signature } = signRequest(
      method,
      path,
      this.starkPrivateKey!,
      params,
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-edgeX-Api-Timestamp': timestamp,
      'X-edgeX-Api-Signature': signature,
    };

    let url = `${this.baseUrl}${path}`;
    const dispatcher = getDispatcher();
    const init: RequestInit = { method, headers, ...(dispatcher ? { dispatcher } : {}) } as RequestInit;

    if (method === 'GET' && params && Object.keys(params).length > 0) {
      const qs = Object.keys(params)
        .sort()
        .map(k => `${k}=${encodeURIComponent(String(params[k]))}`)
        .join('&');
      url += `?${qs}`;
    } else if (method === 'POST' && params) {
      init.body = JSON.stringify(params);
    }

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiError('NETWORK', `Failed to connect to ${this.baseUrl} — ${msg}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ApiError(String(res.status), `HTTP ${res.status}: ${res.statusText} ${text}`);
    }

    const json = (await res.json()) as ApiResponse<T>;
    if (json.code !== '0' && json.code !== 'SUCCESS') {
      throw new ApiError(json.code, json.msg || 'Unknown API error');
    }

    return json.data;
  }

  get currentAccountId(): string | undefined {
    return this.accountId;
  }

  // ─── Public: Metadata ───

  async getMetaData(): Promise<{ contractList: ContractMeta[]; coinList: CoinMeta[] }> {
    return this.request('GET', '/api/v1/public/meta/getMetaData');
  }

  async getServerTime(): Promise<{ serverTime: string }> {
    return this.request('GET', '/api/v1/public/meta/getServerTime');
  }

  // ─── Public: Quote ───

  async getTicker(contractId?: string): Promise<Ticker[]> {
    const params: Record<string, string> = {};
    if (contractId) params.contractId = contractId;
    return this.request('GET', '/api/v1/public/quote/getTicker', params);
  }

  async getDepth(contractId: string, level: string = '15'): Promise<Depth> {
    const data = await this.request<Depth[]>('GET', '/api/v1/public/quote/getDepth', {
      contractId,
      level,
    });
    return Array.isArray(data) ? data[0]! : data;
  }

  async getKline(contractId: string, klineType: string, size: string = '100'): Promise<KlineResponse> {
    return this.request('GET', '/api/v1/public/quote/getKline', {
      contractId,
      klineType,
      size,
      priceType: 'LAST_PRICE',
    });
  }

  async getTickerSummary(): Promise<unknown> {
    return this.request('GET', '/api/v1/public/quote/getTicketSummary');
  }

  async getLongShortRatio(contractId?: string): Promise<LongShortRatioResponse> {
    const params: Record<string, string> = {};
    if (contractId) params.contractId = contractId;
    return this.request('GET', '/api/v1/public/quote/getExchangeLongShortRatio', params);
  }

  // ─── Public: Funding ───

  async getLatestFundingRate(contractId?: string): Promise<FundingRate[]> {
    const params: Record<string, string> = {};
    if (contractId) params.contractId = contractId;
    return this.request('GET', '/api/v1/public/funding/getLatestFundingRate', params);
  }

  async getFundingRatePage(contractId: string, page: string = '1', limit: string = '20'): Promise<unknown> {
    return this.request('GET', '/api/v1/public/funding/getFundingRatePage', {
      contractId,
      page,
      limit,
    });
  }

  // ─── Private: Account ───

  async getAccountAsset(): Promise<AccountAsset> {
    return this.authRequest('GET', '/api/v1/private/account/getAccountAsset', {
      accountId: this.accountId!,
    });
  }

  async getAccountById(): Promise<unknown> {
    return this.authRequest('GET', '/api/v1/private/account/getAccountById', {
      accountId: this.accountId!,
    });
  }

  async updateLeverageSetting(contractId: string, leverage: string): Promise<unknown> {
    return this.authRequest('POST', '/api/v1/private/account/updateLeverageSetting', {
      accountId: this.accountId!,
      contractId,
      leverage,
    });
  }

  // ─── Private: Orders ───

  async getActiveOrders(
    contractId?: string,
    size: string = '50',
  ): Promise<{ dataList: Order[]; nextPageOffsetData: string }> {
    const params: Record<string, unknown> = {
      accountId: this.accountId!,
      size,
    };
    if (contractId) params.contractId = contractId;
    return this.authRequest('GET', '/api/v1/private/order/getActiveOrderPage', params);
  }

  async getOrderById(orderId: string): Promise<Order> {
    return this.authRequest('GET', '/api/v1/private/order/getOrderById', {
      accountId: this.accountId!,
      orderId,
    });
  }

  async getOrderByClientOrderId(clientOrderId: string): Promise<Order> {
    return this.authRequest('GET', '/api/v1/private/order/getOrderByClientOrderId', {
      accountId: this.accountId!,
      clientOrderId,
    });
  }

  async cancelOrderById(orderIds: string[]): Promise<unknown> {
    return this.authRequest('POST', '/api/v1/private/order/cancelOrderById', {
      accountId: this.accountId!,
      orderIdList: orderIds,
    });
  }

  async cancelAllOrder(contractId?: string): Promise<unknown> {
    const params: Record<string, unknown> = {
      accountId: this.accountId!,
    };
    if (contractId) params.contractId = contractId;
    return this.authRequest('POST', '/api/v1/private/order/cancelAllOrder', params);
  }

  async createOrder(orderParams: Record<string, unknown>): Promise<unknown> {
    return this.authRequest('POST', '/api/v1/private/order/createOrder', {
      ...orderParams,
      accountId: this.accountId!,
    });
  }

  async getMaxCreateOrderSize(contractId: string, price?: string): Promise<unknown> {
    const params: Record<string, unknown> = {
      accountId: this.accountId!,
      contractId,
    };
    if (price) params.price = price;
    return this.authRequest('POST', '/api/v1/private/order/getMaxCreateOrderSize', params);
  }

  // ─── Private: Order (extended) ───

  async cancelOrderByClientOrderId(clientOrderIds: string[]): Promise<unknown> {
    return this.authRequest('POST', '/api/v1/private/order/cancelOrderByClientOrderId', {
      accountId: this.accountId!,
      clientOrderIdList: clientOrderIds,
    });
  }

  async getHistoryOrderFillTransactionPage(opts?: {
    size?: string;
    offsetData?: string;
    filterContractIdList?: string[];
    filterOrderIdList?: string[];
    filterStartCreatedTimeInclusive?: string;
    filterEndCreatedTimeExclusive?: string;
  }): Promise<unknown> {
    const params: Record<string, unknown> = {
      accountId: this.accountId!,
    };
    if (opts?.size) params.size = opts.size;
    if (opts?.offsetData) params.offsetData = opts.offsetData;
    if (opts?.filterContractIdList?.length) params.filterContractIdList = opts.filterContractIdList.join(',');
    if (opts?.filterOrderIdList?.length) params.filterOrderIdList = opts.filterOrderIdList.join(',');
    if (opts?.filterStartCreatedTimeInclusive) params.filterStartCreatedTimeInclusive = opts.filterStartCreatedTimeInclusive;
    if (opts?.filterEndCreatedTimeExclusive) params.filterEndCreatedTimeExclusive = opts.filterEndCreatedTimeExclusive;
    return this.authRequest('GET', '/api/v1/private/order/getHistoryOrderFillTransactionPage', params);
  }

  // ─── Private: Account (extended) ───

  async getPositionTransactionPage(opts?: {
    size?: string;
    offsetData?: string;
    filterContractIdList?: string[];
    filterStartCreatedTimeInclusive?: string;
    filterEndCreatedTimeExclusive?: string;
  }): Promise<unknown> {
    const params: Record<string, unknown> = {
      accountId: this.accountId!,
    };
    if (opts?.size) params.size = opts.size;
    if (opts?.offsetData) params.offsetData = opts.offsetData;
    if (opts?.filterContractIdList?.length) params.filterContractIdList = opts.filterContractIdList.join(',');
    if (opts?.filterStartCreatedTimeInclusive) params.filterStartCreatedTimeInclusive = opts.filterStartCreatedTimeInclusive;
    if (opts?.filterEndCreatedTimeExclusive) params.filterEndCreatedTimeExclusive = opts.filterEndCreatedTimeExclusive;
    return this.authRequest('GET', '/api/v1/private/account/getPositionTransactionPage', params);
  }

  async getCollateralTransactionPage(opts?: {
    size?: string;
    offsetData?: string;
    filterStartCreatedTimeInclusive?: string;
    filterEndCreatedTimeExclusive?: string;
  }): Promise<unknown> {
    const params: Record<string, unknown> = {
      accountId: this.accountId!,
    };
    if (opts?.size) params.size = opts.size;
    if (opts?.offsetData) params.offsetData = opts.offsetData;
    if (opts?.filterStartCreatedTimeInclusive) params.filterStartCreatedTimeInclusive = opts.filterStartCreatedTimeInclusive;
    if (opts?.filterEndCreatedTimeExclusive) params.filterEndCreatedTimeExclusive = opts.filterEndCreatedTimeExclusive;
    return this.authRequest('GET', '/api/v1/private/account/getCollateralTransactionPage', params);
  }

  async getPositionTermPage(opts?: {
    size?: string;
    offsetData?: string;
    filterContractIdList?: string[];
    filterStartCreatedTimeInclusive?: string;
    filterEndCreatedTimeExclusive?: string;
  }): Promise<unknown> {
    const params: Record<string, unknown> = {
      accountId: this.accountId!,
    };
    if (opts?.size) params.size = opts.size;
    if (opts?.offsetData) params.offsetData = opts.offsetData;
    if (opts?.filterContractIdList?.length) params.filterContractIdList = opts.filterContractIdList.join(',');
    if (opts?.filterStartCreatedTimeInclusive) params.filterStartCreatedTimeInclusive = opts.filterStartCreatedTimeInclusive;
    if (opts?.filterEndCreatedTimeExclusive) params.filterEndCreatedTimeExclusive = opts.filterEndCreatedTimeExclusive;
    return this.authRequest('GET', '/api/v1/private/account/getPositionTermPage', params);
  }

  async getAccountAssetSnapshotPage(opts?: {
    size?: string;
    offsetData?: string;
    filterStartCreatedTimeInclusive?: string;
    filterEndCreatedTimeExclusive?: string;
  }): Promise<unknown> {
    const params: Record<string, unknown> = {
      accountId: this.accountId!,
    };
    if (opts?.size) params.size = opts.size;
    if (opts?.offsetData) params.offsetData = opts.offsetData;
    if (opts?.filterStartCreatedTimeInclusive) params.filterStartCreatedTimeInclusive = opts.filterStartCreatedTimeInclusive;
    if (opts?.filterEndCreatedTimeExclusive) params.filterEndCreatedTimeExclusive = opts.filterEndCreatedTimeExclusive;
    return this.authRequest('GET', '/api/v1/private/account/getAccountAssetSnapshotPage', params);
  }

  async getPositionTransactionById(transactionIds: string[]): Promise<unknown> {
    return this.authRequest('GET', '/api/v1/private/account/getPositionTransactionById', {
      accountId: this.accountId!,
      transactionIdList: transactionIds.join(','),
    });
  }

  async getCollateralTransactionById(transactionIds: string[]): Promise<unknown> {
    return this.authRequest('GET', '/api/v1/private/account/getCollateralTransactionById', {
      accountId: this.accountId!,
      transactionIdList: transactionIds.join(','),
    });
  }

  async getAccountDeleverageLight(): Promise<unknown> {
    return this.authRequest('GET', '/api/v1/private/account/getAccountDeleverageLight', {
      accountId: this.accountId!,
    });
  }

  async registerAccount(l2Key: string, l2KeyYCoordinate: string, clientAccountId: string): Promise<unknown> {
    return this.authRequest('POST', '/api/v1/private/account/registerAccount', {
      accountId: this.accountId!,
      l2Key,
      l2KeyYCoordinate,
      clientAccountId,
    });
  }

  // ─── Private: Transfer ───

  async getTransferOutById(transferIds: string[]): Promise<unknown> {
    return this.authRequest('GET', '/api/v1/private/transfer/getTransferOutById', {
      accountId: this.accountId!,
      transferIdList: transferIds.join(','),
    });
  }

  async getTransferInById(transferIds: string[]): Promise<unknown> {
    return this.authRequest('GET', '/api/v1/private/transfer/getTransferInById', {
      accountId: this.accountId!,
      transferIdList: transferIds.join(','),
    });
  }

  async getTransferOutAvailableAmount(coinId: string): Promise<unknown> {
    return this.authRequest('GET', '/api/v1/private/transfer/getTransferOutAvailableAmount', {
      accountId: this.accountId!,
      coinId,
    });
  }

  async createTransferOut(body: Record<string, unknown>): Promise<unknown> {
    return this.authRequest('POST', '/api/v1/private/transfer/createTransferOut', {
      ...body,
      accountId: this.accountId!,
    });
  }

  async getActiveTransferOut(opts?: {
    size?: string;
    offsetData?: string;
    filterCoinIdList?: string[];
    filterStatusList?: string[];
    filterStartCreatedTimeInclusive?: string;
    filterEndCreatedTimeExclusive?: string;
  }): Promise<unknown> {
    const params: Record<string, unknown> = {
      accountId: this.accountId!,
    };
    if (opts?.size) params.size = opts.size;
    if (opts?.offsetData) params.offsetData = opts.offsetData;
    if (opts?.filterCoinIdList?.length) params.filterCoinIdList = opts.filterCoinIdList.join(',');
    if (opts?.filterStatusList?.length) params.filterStatusList = opts.filterStatusList.join(',');
    if (opts?.filterStartCreatedTimeInclusive) params.filterStartCreatedTimeInclusive = opts.filterStartCreatedTimeInclusive;
    if (opts?.filterEndCreatedTimeExclusive) params.filterEndCreatedTimeExclusive = opts.filterEndCreatedTimeExclusive;
    return this.authRequest('GET', '/api/v1/private/transfer/getActiveTransferOut', params);
  }

  async getActiveTransferIn(opts?: {
    size?: string;
    offsetData?: string;
    filterCoinIdList?: string[];
    filterStatusList?: string[];
    filterStartCreatedTimeInclusive?: string;
    filterEndCreatedTimeExclusive?: string;
  }): Promise<unknown> {
    const params: Record<string, unknown> = {
      accountId: this.accountId!,
    };
    if (opts?.size) params.size = opts.size;
    if (opts?.offsetData) params.offsetData = opts.offsetData;
    if (opts?.filterCoinIdList?.length) params.filterCoinIdList = opts.filterCoinIdList.join(',');
    if (opts?.filterStatusList?.length) params.filterStatusList = opts.filterStatusList.join(',');
    if (opts?.filterStartCreatedTimeInclusive) params.filterStartCreatedTimeInclusive = opts.filterStartCreatedTimeInclusive;
    if (opts?.filterEndCreatedTimeExclusive) params.filterEndCreatedTimeExclusive = opts.filterEndCreatedTimeExclusive;
    return this.authRequest('GET', '/api/v1/private/transfer/getActiveTransferIn', params);
  }

  // ─── Private: Asset ───

  async getAssetOrdersPage(opts?: {
    size?: string;
    offsetData?: string;
    filterCoinIdList?: string[];
    filterStartCreatedTimeInclusive?: string;
    filterEndCreatedTimeExclusive?: string;
  }): Promise<unknown> {
    const params: Record<string, unknown> = {
      accountId: this.accountId!,
    };
    if (opts?.size) params.size = opts.size;
    if (opts?.offsetData) params.offsetData = opts.offsetData;
    if (opts?.filterCoinIdList?.length) params.filterCoinIdList = opts.filterCoinIdList.join(',');
    if (opts?.filterStartCreatedTimeInclusive) params.filterStartCreatedTimeInclusive = opts.filterStartCreatedTimeInclusive;
    if (opts?.filterEndCreatedTimeExclusive) params.filterEndCreatedTimeExclusive = opts.filterEndCreatedTimeExclusive;
    return this.authRequest('GET', '/api/v1/private/assets/getAllOrdersPage', params);
  }

  async getCoinRate(chainId: string = '1', coin: string = '0xdac17f958d2ee523a2206206994597c13d831ec7'): Promise<unknown> {
    return this.authRequest('GET', '/api/v1/private/assets/getCoinRate', {
      accountId: this.accountId!,
      chainId,
      coin,
    });
  }

  async createNormalWithdraw(body: Record<string, unknown>): Promise<unknown> {
    return this.authRequest('POST', '/api/v1/private/assets/createNormalWithdraw', {
      ...body,
      accountId: this.accountId!,
    });
  }

  async getNormalWithdrawById(opts?: {
    size?: string;
    offsetData?: string;
    filterCoinIdList?: string[];
    filterStatusList?: string[];
    filterStartCreatedTimeInclusive?: string;
    filterEndCreatedTimeExclusive?: string;
  }): Promise<unknown> {
    const params: Record<string, unknown> = {
      accountId: this.accountId!,
    };
    if (opts?.size) params.size = opts.size;
    if (opts?.offsetData) params.offsetData = opts.offsetData;
    if (opts?.filterCoinIdList?.length) params.filterCoinIdList = opts.filterCoinIdList.join(',');
    if (opts?.filterStatusList?.length) params.filterStatusList = opts.filterStatusList.join(',');
    if (opts?.filterStartCreatedTimeInclusive) params.filterStartCreatedTimeInclusive = opts.filterStartCreatedTimeInclusive;
    if (opts?.filterEndCreatedTimeExclusive) params.filterEndCreatedTimeExclusive = opts.filterEndCreatedTimeExclusive;
    return this.authRequest('GET', '/api/v1/private/assets/getNormalWithdrawById', params);
  }

  async getNormalWithdrawableAmount(address: string): Promise<unknown> {
    return this.authRequest('GET', '/api/v1/private/assets/getNormalWithdrawableAmount', {
      accountId: this.accountId!,
      address,
    });
  }

  // ─── Public: Quote (extended) ───

  async getMultiContractKline(contractIdList: string[], interval: string, limit: string = '1'): Promise<unknown> {
    return this.request('GET', '/api/v1/public/quote/getMultiContractKline', {
      contractIdList: contractIdList.join(','),
      interval,
      limit,
    });
  }
}
