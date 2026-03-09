export interface EdgexConfig {
    accountId?: string;
    starkPrivateKey?: string;
    baseUrl: string;
    wsUrl: string;
    edgeChainRpcUrl: string;
}
export interface ApiResponse<T> {
    code: string;
    msg: string;
    data: T;
}
export interface ContractMeta {
    contractId: string;
    contractName: string;
    tickSize: string;
    stepSize: string;
    defaultLeverage: string;
    maxLeverage: string;
    minOrderSize: string;
    maxOrderSize: string;
    displayName?: string;
    quoteCoinId?: string;
    starkExSyntheticAssetId?: string;
    starkExResolution?: string;
    defaultTakerFeeRate?: string;
    defaultMakerFeeRate?: string;
}
export interface CoinMeta {
    coinId: string;
    coinName: string;
    stepSize: string;
    starkExAssetId?: string;
    starkExResolution?: string;
}
export interface MetaData {
    contractList: ContractMeta[];
    serverTime: string;
    global: Record<string, unknown>;
}
export interface Ticker {
    contractId: string;
    contractName: string;
    lastPrice: string;
    oraclePrice: string;
    markPrice: string;
    indexPrice: string;
    priceChange: string;
    priceChangePercent: string;
    high: string;
    low: string;
    open: string;
    close: string;
    size: string;
    value: string;
    trades: string;
    openInterest: string;
    fundingRate: string;
}
export interface DepthLevel {
    price: string;
    size: string;
}
export interface Depth {
    contractId: string;
    asks: DepthLevel[];
    bids: DepthLevel[];
    timestamp: string;
}
export interface KlineResponse {
    dataList: KlineBar[];
    nextPageOffsetData: string;
}
export interface KlineBar {
    klineId: string;
    contractId: string;
    contractName: string;
    klineType: string;
    klineTime: string;
    open: string;
    close: string;
    high: string;
    low: string;
    size: string;
    value: string;
    trades: string;
    [key: string]: string;
}
export interface FundingRate {
    contractId: string;
    contractName: string;
    fundingRate: string;
    fundingTimestamp: string;
    nextFundingTime?: string;
}
export interface TickerSummary {
    totalVolume24h: string;
    totalOpenInterest: string;
    totalTrades24h: string;
}
export interface LongShortRatioResponse {
    exchangeLongShortRatioList: LongShortRatio[];
}
export interface LongShortRatio {
    range: string;
    contractId: string;
    exchange: string;
    buyRatio: string;
    sellRatio: string;
    buyVolUsd: string;
    sellVolUsd: string;
}
export declare const KLINE_INTERVALS: Record<string, string>;
export interface AccountAsset {
    accountId: string;
    totalEquity: string;
    availableBalance: string;
    initialMargin: string;
    maintenanceMargin: string;
    unrealizedPnl: string;
    positionList: Position[];
}
export interface Position {
    contractId: string;
    contractName: string;
    side: 'LONG' | 'SHORT';
    size: string;
    entryPrice: string;
    markPrice: string;
    liquidationPrice: string;
    unrealizedPnl: string;
    leverage: string;
}
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET';
export interface Order {
    orderId: string;
    clientOrderId: string;
    contractId: string;
    contractName: string;
    side: OrderSide;
    type: OrderType;
    price: string;
    size: string;
    filledSize: string;
    status: string;
    createdTime: string;
    updatedTime: string;
}
export interface CreateOrderParams {
    contractId: string;
    side: OrderSide;
    type: OrderType;
    size: string;
    price?: string;
    clientOrderId?: string;
    isSetOpenTp?: boolean;
    isSetOpenSl?: boolean;
    openTp?: {
        side: OrderSide;
        price: string;
        size: string;
    };
    openSl?: {
        side: OrderSide;
        price: string;
        size: string;
    };
}
export type OutputFormat = 'human' | 'json';
//# sourceMappingURL=types.d.ts.map