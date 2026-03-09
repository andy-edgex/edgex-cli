import type { ContractMeta, CoinMeta, Ticker, Depth, KlineResponse, FundingRate, LongShortRatioResponse, AccountAsset, Order, EdgexConfig } from './types.js';
export declare class EdgexClient {
    private baseUrl;
    private accountId?;
    private starkPrivateKey?;
    constructor(config: EdgexConfig);
    private requireAuth;
    private request;
    private authRequest;
    get currentAccountId(): string | undefined;
    getMetaData(): Promise<{
        contractList: ContractMeta[];
        coinList: CoinMeta[];
    }>;
    getServerTime(): Promise<{
        serverTime: string;
    }>;
    getTicker(contractId?: string): Promise<Ticker[]>;
    getDepth(contractId: string, level?: string): Promise<Depth>;
    getKline(contractId: string, klineType: string, size?: string): Promise<KlineResponse>;
    getTickerSummary(): Promise<unknown>;
    getLongShortRatio(contractId?: string): Promise<LongShortRatioResponse>;
    getLatestFundingRate(contractId?: string): Promise<FundingRate[]>;
    getFundingRatePage(contractId: string, page?: string, limit?: string): Promise<unknown>;
    getAccountAsset(): Promise<AccountAsset>;
    getAccountById(): Promise<unknown>;
    updateLeverageSetting(contractId: string, leverage: string): Promise<unknown>;
    getActiveOrders(contractId?: string, size?: string): Promise<{
        dataList: Order[];
        nextPageOffsetData: string;
    }>;
    getOrderById(orderId: string): Promise<Order>;
    getOrderByClientOrderId(clientOrderId: string): Promise<Order>;
    cancelOrderById(orderIds: string[]): Promise<unknown>;
    cancelAllOrder(contractId?: string): Promise<unknown>;
    createOrder(orderParams: Record<string, unknown>): Promise<unknown>;
    getMaxCreateOrderSize(contractId: string, price?: string): Promise<unknown>;
    cancelOrderByClientOrderId(clientOrderIds: string[]): Promise<unknown>;
    getHistoryOrderFillTransactionPage(opts?: {
        size?: string;
        offsetData?: string;
        filterContractIdList?: string[];
        filterOrderIdList?: string[];
        filterStartCreatedTimeInclusive?: string;
        filterEndCreatedTimeExclusive?: string;
    }): Promise<unknown>;
    getPositionTransactionPage(opts?: {
        size?: string;
        offsetData?: string;
        filterContractIdList?: string[];
        filterStartCreatedTimeInclusive?: string;
        filterEndCreatedTimeExclusive?: string;
    }): Promise<unknown>;
    getCollateralTransactionPage(opts?: {
        size?: string;
        offsetData?: string;
        filterStartCreatedTimeInclusive?: string;
        filterEndCreatedTimeExclusive?: string;
    }): Promise<unknown>;
    getPositionTermPage(opts?: {
        size?: string;
        offsetData?: string;
        filterContractIdList?: string[];
        filterStartCreatedTimeInclusive?: string;
        filterEndCreatedTimeExclusive?: string;
    }): Promise<unknown>;
    getAccountAssetSnapshotPage(opts?: {
        size?: string;
        offsetData?: string;
        filterStartCreatedTimeInclusive?: string;
        filterEndCreatedTimeExclusive?: string;
    }): Promise<unknown>;
    getPositionTransactionById(transactionIds: string[]): Promise<unknown>;
    getCollateralTransactionById(transactionIds: string[]): Promise<unknown>;
    getAccountDeleverageLight(): Promise<unknown>;
    registerAccount(l2Key: string, l2KeyYCoordinate: string, clientAccountId: string): Promise<unknown>;
    getTransferOutById(transferIds: string[]): Promise<unknown>;
    getTransferInById(transferIds: string[]): Promise<unknown>;
    getTransferOutAvailableAmount(coinId: string): Promise<unknown>;
    createTransferOut(body: Record<string, unknown>): Promise<unknown>;
    getActiveTransferOut(opts?: {
        size?: string;
        offsetData?: string;
        filterCoinIdList?: string[];
        filterStatusList?: string[];
        filterStartCreatedTimeInclusive?: string;
        filterEndCreatedTimeExclusive?: string;
    }): Promise<unknown>;
    getActiveTransferIn(opts?: {
        size?: string;
        offsetData?: string;
        filterCoinIdList?: string[];
        filterStatusList?: string[];
        filterStartCreatedTimeInclusive?: string;
        filterEndCreatedTimeExclusive?: string;
    }): Promise<unknown>;
    getAssetOrdersPage(opts?: {
        size?: string;
        offsetData?: string;
        filterCoinIdList?: string[];
        filterStartCreatedTimeInclusive?: string;
        filterEndCreatedTimeExclusive?: string;
    }): Promise<unknown>;
    getCoinRate(chainId?: string, coin?: string): Promise<unknown>;
    createNormalWithdraw(body: Record<string, unknown>): Promise<unknown>;
    getNormalWithdrawById(opts?: {
        size?: string;
        offsetData?: string;
        filterCoinIdList?: string[];
        filterStatusList?: string[];
        filterStartCreatedTimeInclusive?: string;
        filterEndCreatedTimeExclusive?: string;
    }): Promise<unknown>;
    getNormalWithdrawableAmount(address: string): Promise<unknown>;
    getMultiContractKline(contractIdList: string[], interval: string, limit?: string): Promise<unknown>;
}
//# sourceMappingURL=client.d.ts.map