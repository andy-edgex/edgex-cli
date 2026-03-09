export declare function buildSignContent(timestamp: number, method: string, path: string, params?: Record<string, unknown>): string;
export declare function signRequest(method: string, path: string, starkPrivateKey: string, params?: Record<string, unknown>): {
    timestamp: string;
    signature: string;
};
//# sourceMappingURL=auth.d.ts.map