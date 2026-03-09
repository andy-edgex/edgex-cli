export declare class EdgexError extends Error {
    code?: string | undefined;
    statusCode?: number | undefined;
    constructor(message: string, code?: string | undefined, statusCode?: number | undefined);
}
export declare class ApiError extends EdgexError {
    constructor(code: string, msg: string);
}
export declare class ConfigError extends EdgexError {
    constructor(message: string);
}
export declare function handleError(err: unknown, format?: string): never;
//# sourceMappingURL=errors.d.ts.map