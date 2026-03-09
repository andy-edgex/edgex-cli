import type { EdgexConfig } from './types.js';
export declare function isTestnet(): boolean;
export declare function getContractsCacheFile(): string;
export declare function ensureConfigDir(): Promise<void>;
export declare function loadConfig(): Promise<EdgexConfig>;
export declare function loadConfigSync(): EdgexConfig;
export declare function saveConfig(config: Partial<EdgexConfig>): Promise<void>;
export declare function getConfigPath(): string;
//# sourceMappingURL=config.d.ts.map