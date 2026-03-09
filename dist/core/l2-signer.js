import { createHash, randomBytes } from 'node:crypto';
import { pedersen, Point } from '@scure/starknet';
const EC_ORDER = Point.Fn.ORDER;
const MAX_STARK_VALUE = 1n << 251n;
const LIMIT_ORDER_WITH_FEES = 3n;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
function calcNonce(clientOrderId) {
    const hash = createHash('sha256').update(clientOrderId).digest('hex');
    return parseInt(hash.slice(0, 8), 16);
}
function bytesToBigInt(bytes) {
    let n = 0n;
    for (const b of bytes)
        n = (n << 8n) | BigInt(b);
    return n;
}
function starkEcdsaSign(msgHash, privKey) {
    const Fn = Point.Fn;
    for (let attempt = 0; attempt < 256; attempt++) {
        const kBig = bytesToBigInt(randomBytes(32)) % EC_ORDER;
        if (kBig === 0n)
            continue;
        const R = Point.BASE.multiply(kBig);
        const r = R.x;
        if (r === 0n || r >= MAX_STARK_VALUE)
            continue;
        const sum = (msgHash + (r * privKey) % EC_ORDER) % EC_ORDER;
        if (sum === 0n)
            continue;
        const w = (kBig * Fn.inv(sum)) % EC_ORDER;
        if (w === 0n || w >= MAX_STARK_VALUE)
            continue;
        const s = Fn.inv(w);
        return { r, s };
    }
    throw new Error('Failed to generate valid StarkEx ECDSA signature');
}
function hexToInt(hex) {
    return BigInt(hex);
}
function decimalToBigInt(value, factor) {
    const parts = value.split('.');
    const intPart = BigInt(parts[0] ?? '0');
    const fracStr = (parts[1] ?? '').padEnd(18, '0');
    const fracPart = BigInt(fracStr);
    const result = intPart * factor + (fracPart * factor) / 10n ** 18n;
    return result;
}
function ceilDiv(a, b) {
    return (a + b - 1n) / b;
}
export function computeL2OrderFields(input, meta, starkPrivateKey) {
    const clientOrderId = String(Date.now()) + String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    const nonce = calcNonce(clientOrderId);
    const syntheticFactor = hexToInt(meta.syntheticResolution);
    const shiftFactor = hexToInt(meta.collateralResolution);
    const feeRate = parseFloat(meta.feeRate || '0.001');
    const size = parseFloat(input.size);
    let l2Price;
    if (input.type === 'MARKET') {
        if (input.side === 'BUY') {
            const oracle = parseFloat(input.oraclePrice || '0');
            l2Price = oracle * 10;
        }
        else {
            l2Price = parseFloat(meta.tickSize);
        }
    }
    else {
        l2Price = parseFloat(input.price || '0');
    }
    const l2ValueRaw = l2Price * size;
    const l2Value = parseFloat(l2ValueRaw.toFixed(6));
    const limitFee = Math.ceil(size * l2Price * feeRate);
    const now = Date.now();
    const expireTime = now + ONE_DAY_MS;
    const l2ExpireTime = expireTime + 9 * ONE_DAY_MS;
    const l2ExpireHour = Math.floor(l2ExpireTime / ONE_HOUR_MS);
    // Scale to StarkEx integers
    const amountSynthetic = decimalToBigInt(input.size, syntheticFactor);
    const amountCollateral = decimalToBigInt(l2Value.toString(), shiftFactor);
    const maxAmountFee = BigInt(limitFee) * shiftFactor;
    const syntheticAssetId = hexToInt(meta.starkExSyntheticAssetId);
    const collateralAssetId = hexToInt(meta.collateralAssetId);
    const feeAssetId = collateralAssetId;
    // Direction mapping
    let assetIdSell, assetIdBuy;
    let amountSell, amountBuy;
    if (input.side === 'BUY') {
        assetIdSell = collateralAssetId;
        assetIdBuy = syntheticAssetId;
        amountSell = amountCollateral;
        amountBuy = amountSynthetic;
    }
    else {
        assetIdSell = syntheticAssetId;
        assetIdBuy = collateralAssetId;
        amountSell = amountSynthetic;
        amountBuy = amountCollateral;
    }
    const positionId = BigInt(input.accountId);
    // Pedersen hash chain (4 steps)
    let msg = pedersen(assetIdSell, assetIdBuy);
    msg = pedersen(msg, feeAssetId);
    const packedMessage0 = (amountSell << 64n) |
        (amountBuy & 0xffffffffffffffffn);
    const packedMessage0Full = (packedMessage0 << 64n) |
        (maxAmountFee & 0xffffffffffffffffn);
    const packedMessage0WithNonce = (packedMessage0Full << 32n) |
        BigInt(nonce);
    msg = pedersen(msg, packedMessage0WithNonce);
    const packedMessage1 = (LIMIT_ORDER_WITH_FEES << 64n | positionId);
    const packedMessage1WithPos = (packedMessage1 << 64n) | positionId;
    const packedMessage1Full = (packedMessage1WithPos << 64n) | positionId;
    const packedMessage1WithExpire = (packedMessage1Full << 32n) | BigInt(l2ExpireHour);
    const packedMessage1Final = packedMessage1WithExpire << 17n;
    msg = pedersen(msg, packedMessage1Final);
    // Manual StarkEx ECDSA sign (bypasses @scure/starknet sign() checkMessage bug)
    const msgHash = (typeof msg === 'bigint' ? msg : BigInt(msg)) % EC_ORDER;
    const privKeyRaw = starkPrivateKey.startsWith('0x') ? starkPrivateKey.slice(2) : starkPrivateKey;
    const privKeyBig = BigInt('0x' + privKeyRaw);
    const { r, s } = starkEcdsaSign(msgHash, privKeyBig);
    const rHex = r.toString(16).padStart(64, '0');
    const sHex = s.toString(16).padStart(64, '0');
    return {
        clientOrderId,
        l2Nonce: String(nonce),
        l2Value: l2Value.toString(),
        l2Size: input.size,
        l2LimitFee: limitFee.toString(),
        l2ExpireTime: String(l2ExpireTime),
        l2Signature: rHex + sHex,
        expireTime: String(expireTime),
    };
}
// ─── Transfer L2 Signing ───
const TRANSFER_TYPE = 4n;
const WITHDRAWAL_TO_ADDRESS_TYPE = 7n;
const FIELD_PRIME = 0x800000000000011000000000000000000000000000000000000000000000001n;
export function computeTransferL2Fields(starkPrivateKey, accountId, assetId, receiverPublicKey, receiverAccountId, amount) {
    const clientTransferId = String(Date.now()) + String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    const nonce = calcNonce(clientTransferId);
    const l2ExpireTime = Date.now() + 14 * ONE_DAY_MS;
    const l2ExpireHour = Math.floor(l2ExpireTime / ONE_HOUR_MS);
    const senderPositionId = BigInt(accountId);
    const receiverPositionId = BigInt(receiverAccountId);
    const feePositionId = senderPositionId;
    const maxAmountFee = 0n;
    const assetIdFee = 0n;
    // Pedersen hash chain for transfer
    let msg = pedersen(assetId, assetIdFee);
    msg = pedersen(msg, receiverPublicKey);
    // Pack message 0: sender | receiver | fee | nonce
    let packed0 = senderPositionId;
    packed0 = (packed0 << 64n) + receiverPositionId;
    packed0 = (packed0 << 64n) + feePositionId;
    packed0 = (packed0 << 32n) + BigInt(nonce);
    packed0 = packed0 % FIELD_PRIME;
    msg = pedersen(msg, packed0);
    // Pack message 1: type | amount | fee | expiry, padded 81 bits
    let packed1 = TRANSFER_TYPE;
    packed1 = (packed1 << 64n) + amount;
    packed1 = (packed1 << 64n) + maxAmountFee;
    packed1 = (packed1 << 32n) + BigInt(l2ExpireHour);
    packed1 = packed1 << 81n;
    packed1 = packed1 % FIELD_PRIME;
    msg = pedersen(msg, packed1);
    const msgHash = (typeof msg === 'bigint' ? msg : BigInt(msg)) % EC_ORDER;
    const privKeyRaw = starkPrivateKey.startsWith('0x') ? starkPrivateKey.slice(2) : starkPrivateKey;
    const privKeyBig = BigInt('0x' + privKeyRaw);
    const { r, s } = starkEcdsaSign(msgHash, privKeyBig);
    return {
        clientTransferId,
        l2Nonce: String(nonce),
        l2ExpireTime: String(l2ExpireTime),
        l2Signature: r.toString(16).padStart(64, '0') + s.toString(16).padStart(64, '0'),
    };
}
export function computeWithdrawalL2Fields(starkPrivateKey, accountId, assetIdCollateral, ethAddress, amount) {
    const clientWithdrawId = String(Date.now()) + String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    const nonce = calcNonce(clientWithdrawId);
    const l2ExpireTime = Date.now() + 14 * ONE_DAY_MS;
    const l2ExpireHour = Math.floor(l2ExpireTime / ONE_HOUR_MS);
    // Parse inputs
    const w1Raw = assetIdCollateral.startsWith('0x')
        ? BigInt(assetIdCollateral)
        : BigInt('0x' + assetIdCollateral);
    const w1 = w1Raw % FIELD_PRIME;
    const ethAddrRaw = ethAddress.startsWith('0x')
        ? BigInt(ethAddress)
        : BigInt('0x' + ethAddress);
    const ethAddrInt = ethAddrRaw % FIELD_PRIME;
    const positionId = BigInt(accountId);
    const amountBig = BigInt(amount);
    // Pack w5: type(64) | positionId(32) | nonce(64) | amount(32) | expiry << 49
    let w5 = WITHDRAWAL_TO_ADDRESS_TYPE;
    w5 = (w5 << 64n) + positionId;
    w5 = (w5 << 32n) + BigInt(nonce);
    w5 = (w5 << 64n) + amountBig;
    w5 = (w5 << 32n) + BigInt(l2ExpireHour);
    w5 = w5 << 49n;
    w5 = w5 % FIELD_PRIME;
    // Pedersen hash chain
    let msg = pedersen(w1, ethAddrInt);
    msg = pedersen(msg, w5);
    const msgHash = (typeof msg === 'bigint' ? msg : BigInt(msg)) % EC_ORDER;
    const privKeyRaw = starkPrivateKey.startsWith('0x') ? starkPrivateKey.slice(2) : starkPrivateKey;
    const privKeyBig = BigInt('0x' + privKeyRaw);
    const { r, s } = starkEcdsaSign(msgHash, privKeyBig);
    return {
        clientWithdrawId,
        l2ExpireTime: String(l2ExpireTime),
        l2Signature: r.toString(16).padStart(64, '0') + s.toString(16).padStart(64, '0'),
    };
}
//# sourceMappingURL=l2-signer.js.map