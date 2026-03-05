import type { ContractMeta, CoinMeta } from './types.js';
import { EdgexError } from '../utils/errors.js';
import { findCoin } from './symbols.js';
import { computeL2OrderFields, type L2OrderMeta } from './l2-signer.js';

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

export function getL2Meta(contract: ContractMeta, coins: CoinMeta[]): L2OrderMeta {
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

export function buildOrderPayload(params: OrderCreationParams): OrderCreationResult {
    const { contract, coins, starkPrivateKey, accountId, side, type, size, price, oraclePrice, tp, sl, clientId } = params;

    if (type === 'LIMIT' && !price) {
        throw new EdgexError('--price is required for limit orders');
    }

    const l2Meta = getL2Meta(contract, coins);
    const l2Fields = computeL2OrderFields(
        {
            side,
            type,
            size,
            price,
            oraclePrice,
            accountId,
            clientId,
        },
        l2Meta,
        starkPrivateKey,
    );

    let orderPrice: string;
    let displayPrice: string | undefined;

    if (type === 'MARKET') {
        orderPrice = '0';
        const oracle = parseFloat(oraclePrice || '0');
        if (side === 'BUY') {
            displayPrice = String(Math.ceil(oracle * 1.1 * 100) / 100);
        } else {
            displayPrice = String(Math.floor(oracle * 0.9 * 100) / 100);
        }
    } else {
        orderPrice = price!;
    }

    const orderBody: Record<string, unknown> = {
        contractId: contract.contractId,
        price: orderPrice,
        size,
        type,
        side,
        timeInForce: type === 'MARKET' ? 'IMMEDIATE_OR_CANCEL' : 'GOOD_TIL_CANCEL',
        reduceOnly: false,
        clientOrderId: l2Fields.clientOrderId,
        expireTime: l2Fields.expireTime,
        l2Nonce: l2Fields.l2Nonce,
        l2Value: l2Fields.l2Value,
        l2Size: l2Fields.l2Size,
        l2LimitFee: l2Fields.l2LimitFee,
        l2ExpireTime: l2Fields.l2ExpireTime,
        l2Signature: l2Fields.l2Signature,
        isPositionTpsl: false,
        isSetOpenTp: false,
        isSetOpenSl: false,
    };

    if (tp) {
        const tpSide = (side === 'BUY' ? 'SELL' : 'BUY') as 'BUY' | 'SELL';
        const tpL2 = computeL2OrderFields(
            { side: tpSide, type: 'MARKET', size, oraclePrice: tpSide === 'BUY' ? tp : undefined, accountId },
            l2Meta,
            starkPrivateKey,
        );
        orderBody.isSetOpenTp = true;
        orderBody.openTp = {
            side: tpSide,
            price: '0',
            size,
            triggerPrice: tp,
            triggerPriceType: 'ORACLE_PRICE',
            clientOrderId: tpL2.clientOrderId,
            expireTime: tpL2.expireTime,
            l2Nonce: tpL2.l2Nonce,
            l2Value: tpL2.l2Value,
            l2Size: tpL2.l2Size,
            l2LimitFee: tpL2.l2LimitFee,
            l2ExpireTime: tpL2.l2ExpireTime,
            l2Signature: tpL2.l2Signature,
        };
    }

    if (sl) {
        const slSide = (side === 'BUY' ? 'SELL' : 'BUY') as 'BUY' | 'SELL';
        const slL2 = computeL2OrderFields(
            { side: slSide, type: 'MARKET', size, oraclePrice: slSide === 'BUY' ? sl : undefined, accountId },
            l2Meta,
            starkPrivateKey,
        );
        orderBody.isSetOpenSl = true;
        orderBody.openSl = {
            side: slSide,
            price: '0',
            size,
            triggerPrice: sl,
            triggerPriceType: 'ORACLE_PRICE',
            clientOrderId: slL2.clientOrderId,
            expireTime: slL2.expireTime,
            l2Nonce: slL2.l2Nonce,
            l2Value: slL2.l2Value,
            l2Size: slL2.l2Size,
            l2LimitFee: slL2.l2LimitFee,
            l2ExpireTime: slL2.l2ExpireTime,
            l2Signature: slL2.l2Signature,
        };
    }

    return { orderBody, l2Fields, displayPrice, orderPrice };
}
