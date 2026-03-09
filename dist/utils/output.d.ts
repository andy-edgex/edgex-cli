import type { OutputFormat } from '../core/types.js';
export declare function printJson(data: unknown): void;
export declare function printTable(headers: string[], rows: string[][]): void;
export declare function printKeyValue(pairs: [string, string][]): void;
export declare function formatPrice(value: string | number, highlight?: boolean): string;
export declare function formatPnl(value: string): string;
export declare function formatPercent(value: string): string;
export declare function output(format: OutputFormat, jsonData: unknown, humanFn: () => void): void;
//# sourceMappingURL=output.d.ts.map