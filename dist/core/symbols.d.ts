import type { ContractMeta, CoinMeta } from './types.js';
export declare function loadCachedContracts(): Promise<ContractMeta[] | null>;
export declare function saveCachedContracts(contracts: ContractMeta[], coins?: CoinMeta[]): Promise<void>;
export declare function getCachedCoins(): CoinMeta[] | null;
export declare function resolveSymbol(contracts: ContractMeta[], input: string): ContractMeta | null;
export declare function findCoin(coins: CoinMeta[], coinId: string): CoinMeta | null;
export declare function formatSymbolName(contract: ContractMeta): string;
//# sourceMappingURL=symbols.d.ts.map