import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { ensureConfigDir, getContractsCacheFile } from './config.js';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let memoryContracts = null;
let memoryCoins = null;
export async function loadCachedContracts() {
    if (memoryContracts)
        return memoryContracts;
    const cacheFile = getContractsCacheFile();
    if (!existsSync(cacheFile))
        return null;
    try {
        const raw = await readFile(cacheFile, 'utf-8');
        const data = JSON.parse(raw);
        if (Date.now() - data.timestamp < CACHE_TTL_MS) {
            memoryContracts = data.contracts;
            memoryCoins = data.coins ?? null;
            return data.contracts;
        }
    }
    catch {
        // Corrupt cache
    }
    return null;
}
export async function saveCachedContracts(contracts, coins) {
    await ensureConfigDir();
    const cacheFile = getContractsCacheFile();
    const data = { timestamp: Date.now(), contracts, coins };
    await writeFile(cacheFile, JSON.stringify(data), 'utf-8');
    memoryContracts = contracts;
    if (coins)
        memoryCoins = coins;
}
export function getCachedCoins() {
    return memoryCoins;
}
export function resolveSymbol(contracts, input) {
    const normalized = input.toUpperCase().trim();
    const exact = contracts.find(c => c.contractName === normalized);
    if (exact)
        return exact;
    for (const suffix of ['USD', 'USDT', 'USDC']) {
        if (!normalized.endsWith(suffix)) {
            const withSuffix = normalized + suffix;
            const match = contracts.find(c => c.contractName === withSuffix);
            if (match)
                return match;
        }
    }
    const byId = contracts.find(c => c.contractId === input.trim());
    if (byId)
        return byId;
    const prefix = contracts.find(c => c.contractName.startsWith(normalized));
    if (prefix)
        return prefix;
    return null;
}
export function findCoin(coins, coinId) {
    return coins.find(c => c.coinId === coinId) ?? null;
}
export function formatSymbolName(contract) {
    return contract.contractName ?? contract.contractId;
}
//# sourceMappingURL=symbols.js.map