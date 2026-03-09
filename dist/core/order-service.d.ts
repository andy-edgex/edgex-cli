import type { ContractMeta, CoinMeta } from './types.js';
import { type L2OrderMeta } from './l2-signer.js';
export interface OrderCreationParams {
    contract: ContractMeta;
    coins: CoinMeta[];
    starkPrivateKey: string;
    accountId: string;
    side: 'BUY' | 'SELL';
    type: 'LIMIT' | 'MARKET';
    size: string;
    price?: string;
    oraclePrice?: string;
    tp?: string;
    sl?: string;
    clientId?: string;
}
export interface OrderCreationResult {
    orderBody: Record<string, unknown>;
    l2Fields: any;
    displayPrice?: string;
    orderPrice: string;
}
export declare function getL2Meta(contract: ContractMeta, coins: CoinMeta[]): L2OrderMeta;
export declare function buildOrderPayload(params: OrderCreationParams): OrderCreationResult;
//# sourceMappingURL=order-service.d.ts.map