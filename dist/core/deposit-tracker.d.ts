/**
 * On-chain deposit status tracker.
 *
 * Given a tx hash, queries multiple chain RPCs to find the transaction,
 * parses the receipt, and returns structured deposit status — all without
 * any backend API dependency.
 */
export interface ChainConfig {
    name: string;
    chainId: number;
    rpcUrl: string;
    /** Known bridge/vault contracts (lowercase) whose logs we parse */
    knownContracts: Record<string, string>;
}
export type DepositStatus = 'not_found' | 'pending' | 'failed' | 'confirmed' | 'credited';
export interface DepositStatusResult {
    status: DepositStatus;
    txHash: string;
    chain: string;
    chainId: number;
    blockNumber?: number;
    /** Decoded deposit amount (human-readable, assuming 6 decimals) */
    amount?: string;
    asset?: string;
    to?: string;
    /** Target accountId or starkKey (from input data) */
    accountId?: string;
    /** Raw deposit details from logs/input */
    details?: Record<string, string>;
    timestamp?: number;
    error?: string;
}
export declare function getDefaultChains(edgeChainRpcUrl: string): ChainConfig[];
export declare function trackDeposit(txHash: string, chains: ChainConfig[]): Promise<DepositStatusResult>;
//# sourceMappingURL=deposit-tracker.d.ts.map