declare function serializeValue(value: unknown): string;
export declare function buildSignContent(timestamp: number, method: string, path: string, params?: Record<string, unknown>): string;
declare function bytesToBigInt(bytes: Uint8Array): bigint;
export declare function signRequest(method: string, path: string, starkPrivateKey: string, params?: Record<string, unknown>): {
    timestamp: string;
    signature: string;
};
export { serializeValue as _serializeValue, bytesToBigInt as _bytesToBigInt };
//# sourceMappingURL=auth.d.ts.map