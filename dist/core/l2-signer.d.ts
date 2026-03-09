export interface L2OrderMeta {
    starkExSyntheticAssetId: string;
    syntheticResolution: string;
    collateralAssetId: string;
    collateralResolution: string;
    feeRate: string;
    tickSize: string;
}
export interface L2OrderInput {
    side: 'BUY' | 'SELL';
    type: 'LIMIT' | 'MARKET';
    size: string;
    price?: string;
    oraclePrice?: string;
    accountId: string;
    clientId?: string;
}
export interface L2OrderFields {
    clientOrderId: string;
    l2Nonce: string;
    l2Value: string;
    l2Size: string;
    l2LimitFee: string;
    l2ExpireTime: string;
    l2Signature: string;
    expireTime: string;
}
export declare function computeL2OrderFields(input: L2OrderInput, meta: L2OrderMeta, starkPrivateKey: string): L2OrderFields;
export interface TransferL2Fields {
    clientTransferId: string;
    l2Nonce: string;
    l2ExpireTime: string;
    l2Signature: string;
}
export declare function computeTransferL2Fields(starkPrivateKey: string, accountId: string, assetId: bigint, receiverPublicKey: bigint, receiverAccountId: string, amount: bigint): TransferL2Fields;
export interface WithdrawalL2Fields {
    clientWithdrawId: string;
    l2ExpireTime: string;
    l2Signature: string;
}
export declare function computeWithdrawalL2Fields(starkPrivateKey: string, accountId: string, assetIdCollateral: string, ethAddress: string, amount: string): WithdrawalL2Fields;
//# sourceMappingURL=l2-signer.d.ts.map