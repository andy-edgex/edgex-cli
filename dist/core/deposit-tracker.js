/**
 * On-chain deposit status tracker.
 *
 * Given a tx hash, queries multiple chain RPCs to find the transaction,
 * parses the receipt, and returns structured deposit status — all without
 * any backend API dependency.
 */
import { getDispatcher } from './proxy.js';
const TOPICS = {
    // FrontContract.DepositTo(address indexed user, address indexed token, uint256 amount)
    FRONT_DEPOSIT_TO: '0x4e37396893499c03b3a225e21bae6c33c5e80136160b71d1d17a0a0b945d5f0e',
    // SpotVault.Deposit(address indexed from, address indexed token, uint256 amount, uint256 accountId)
    SPOT_VAULT_DEPOSIT: '0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7',
    // CCTPVaultRelayer.RelayDepositSucceeded(address indexed recipient, uint256 amount, uint32 sourceDomain, uint32 finalityExecuted, bytes32 nonce)
    RELAY_DEPOSIT_SUCCEEDED: '0x03d158c8a9f4d01a11dc0c79966e2403d36d02d4252f730118854f2dd9a84266',
    // ERC20 Transfer(address indexed from, address indexed to, uint256 value)
    ERC20_TRANSFER: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
};
// deposit(address token, uint256 amount, uint256 starkKey, uint256 positionId, bytes exchangeData)
const BRIDGE_DEPOSIT_SELECTOR = '0xe2bbb158';
// SpotVault.deposit(address token, uint256 amount, uint256 accountId)
const SPOT_DEPOSIT_SELECTOR = '0x0efe6a8b';
const NATIVE_TOKEN = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
// Known token decimals (lowercase address → decimals)
const TOKEN_DECIMALS = {
    [NATIVE_TOKEN]: 18,
    // Mainnet — Edge chain USDC
    '0xd8e20462edce38434616cc6a6a560bb76b582ed8': 6,
    // Mainnet — Arb USDC
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 6,
    // Mainnet — Arb USDT
    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 6,
    // Mainnet — Eth USDT
    '0xdac17f958d2ee523a2206206994597c13d831ec7': 6,
    // Testnet — Edge chain USDC
    '0x2d9f7cad728051aa35ecdc472a14cf8cdf5cfd6b': 6,
    // Testnet — Arb Sepolia USDC
    '0x608babb39bb03c038b8dabc3d4bf4e0d02d455cd': 6,
    // Testnet — Arb Sepolia USDT
    '0x5e2522c505a543fa2714c617e3cd133a6daa9627': 6,
    // Testnet — Eth Sepolia USDC
    '0xd98b590ebe0a3ed8c144170ba4122d402182976f': 6,
    // Testnet — BSC Testnet USDC
    '0xda6c748a7593826e410183f05893dbb363d025a1': 6,
    // Testnet — Polygon USDC
    '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': 6,
};
function getDecimals(token) {
    return TOKEN_DECIMALS[token.toLowerCase()] ?? 18;
}
function getAssetName(token) {
    const t = token.toLowerCase();
    if (t === NATIVE_TOKEN)
        return 'ETH';
    // USDC tokens (mainnet + testnet)
    if ([
        '0xd8e20462edce38434616cc6a6a560bb76b582ed8',
        '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        '0x2d9f7cad728051aa35ecdc472a14cf8cdf5cfd6b',
        '0x608babb39bb03c038b8dabc3d4bf4e0d02d455cd',
        '0xd98b590ebe0a3ed8c144170ba4122d402182976f',
        '0xda6c748a7593826e410183f05893dbb363d025a1',
        '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
    ].includes(t))
        return 'USDC';
    // USDT tokens (mainnet + testnet)
    if ([
        '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
        '0xdac17f958d2ee523a2206206994597c13d831ec7',
        '0x5e2522c505a543fa2714c617e3cd133a6daa9627',
    ].includes(t))
        return 'USDT';
    return 'UNKNOWN';
}
async function rpcCall(rpcUrl, method, params) {
    const dispatcher = getDispatcher();
    const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
        ...(dispatcher ? { dispatcher } : {}),
    });
    const json = (await res.json());
    if (json.error)
        throw new Error(`RPC error: ${json.error.message}`);
    return json.result;
}
// ─── Decode helpers ───
function hex2dec(hex) {
    return BigInt(hex).toString();
}
function hex2amount(hex, decimals = 6) {
    const raw = BigInt(hex);
    const divisor = BigInt(10 ** decimals);
    const whole = raw / divisor;
    const frac = raw % divisor;
    return `${whole}.${frac.toString().padStart(decimals, '0')}`;
}
function hexToAddress(hex) {
    // Extract last 40 chars from 64-char hex
    const clean = hex.replace('0x', '').slice(-40);
    return '0x' + clean;
}
// ─── Parse deposit info from tx input data ───
function parseBridgeDepositInput(input) {
    if (!input.startsWith(BRIDGE_DEPOSIT_SELECTOR))
        return null;
    const data = input.slice(10); // strip selector
    if (data.length < 64 * 4)
        return null;
    return {
        token: hexToAddress(data.slice(0, 64)),
        amount: hex2dec('0x' + data.slice(64, 128)),
        starkKey: '0x' + data.slice(128, 192).replace(/^0+/, ''),
        positionId: hex2dec('0x' + data.slice(192, 256)),
    };
}
function parseSpotDepositInput(input) {
    if (!input.startsWith(SPOT_DEPOSIT_SELECTOR))
        return null;
    const data = input.slice(10);
    if (data.length < 64 * 3)
        return null;
    return {
        token: hexToAddress(data.slice(0, 64)),
        amount: hex2dec('0x' + data.slice(64, 128)),
        accountId: hex2dec('0x' + data.slice(128, 192)),
    };
}
// ─── Parse deposit info from logs ───
function parseSpotVaultDepositLog(log) {
    if (log.topics[0] !== TOPICS.SPOT_VAULT_DEPOSIT)
        return null;
    return {
        from: hexToAddress(log.topics[1] ?? ''),
        token: hexToAddress(log.topics[2] ?? ''),
        amount: hex2dec('0x' + log.data.slice(2, 66)),
        accountId: hex2dec('0x' + log.data.slice(66, 130)),
    };
}
function parseRelayDepositLog(log) {
    if (log.topics[0] !== TOPICS.RELAY_DEPOSIT_SUCCEEDED)
        return null;
    const data = log.data.replace('0x', '');
    return {
        recipient: hexToAddress(log.topics[1] ?? ''),
        amount: hex2dec('0x' + data.slice(0, 64)),
        sourceDomain: hex2dec('0x' + data.slice(64, 128)),
    };
}
function parseFrontDepositToLog(log) {
    if (log.topics[0] !== TOPICS.FRONT_DEPOSIT_TO)
        return null;
    return {
        user: hexToAddress(log.topics[1] ?? ''),
        token: hexToAddress(log.topics[2] ?? ''),
        amount: hex2dec('0x' + log.data.replace('0x', '').slice(0, 64)),
    };
}
function parseErc20TransferLog(log) {
    if (log.topics[0] !== TOPICS.ERC20_TRANSFER)
        return null;
    return {
        from: hexToAddress(log.topics[1] ?? ''),
        to: hexToAddress(log.topics[2] ?? ''),
        amount: hex2dec('0x' + log.data.replace('0x', '').slice(0, 64)),
    };
}
// ─── Get block timestamp ───
async function getBlockTimestamp(rpcUrl, blockNumber) {
    try {
        const block = (await rpcCall(rpcUrl, 'eth_getBlockByNumber', [blockNumber, false]));
        if (block?.timestamp)
            return Number(BigInt(block.timestamp));
    }
    catch { /* ignore */ }
    return undefined;
}
// ─── Main tracker ───
export function getDefaultChains(edgeChainRpcUrl, testnet = false) {
    if (testnet) {
        return [
            {
                name: 'Edge Chain (Testnet)',
                chainId: 33431,
                rpcUrl: edgeChainRpcUrl,
                knownContracts: {
                    '0x3ea4106bb691c3e9f657f8baf1345473e86658c6': 'SpotVault',
                    '0xfc26d07ee1db289ce378edc962e4631364c9c4b1': 'FrontContract',
                },
            },
            {
                name: 'Arbitrum Sepolia',
                chainId: 421614,
                rpcUrl: 'https://rpc.edgex.exchange/RMZZpeTnB6hjfcm8xNNyo6cKa9Zn4qgB/arbitrum-sepolia',
                knownContracts: {
                    '0xa581088edfe121f27a8f2e54e618da7016949928': 'USDC Bridge',
                    '0xc00fa43312312598247bb8f48747b27a0a3a079d': 'USDT Bridge',
                },
            },
            {
                name: 'Ethereum Sepolia',
                chainId: 11155111,
                rpcUrl: 'https://rpc.edgex.exchange/RMZZpeTnB6hjfcm8xNNyo6cKa9Zn4qgB/eth-sepolia',
                knownContracts: {
                    '0x9d982eaf8b7c29c19d6d1b98ae6f17776955508e': 'USDC Bridge',
                },
            },
            {
                name: 'BSC Testnet',
                chainId: 97,
                rpcUrl: 'https://rpc.edgex.exchange/RMZZpeTnB6hjfcm8xNNyo6cKa9Zn4qgB/bsc-testnet',
                knownContracts: {
                    '0xd536f42bfb508534bfe7cb71b8931ddaa66feb95': 'USDC Bridge',
                },
            },
        ];
    }
    return [
        {
            name: 'Edge Chain',
            chainId: 3343,
            rpcUrl: edgeChainRpcUrl,
            knownContracts: {
                '0x238e0edeb0e217fecd9e1ca98efa1219fc841487': 'SpotVault',
            },
        },
        {
            name: 'Arbitrum',
            chainId: 42161,
            rpcUrl: 'https://arb1.arbitrum.io/rpc',
            knownContracts: {
                '0x81144d6e7084928830f9694a201e8c1ce6ed0cb2': 'USDC Bridge',
                '0xceeed84620e5eb9ab1d6dfc316867d2cda332e41': 'USDT Bridge',
            },
        },
        {
            name: 'Ethereum',
            chainId: 1,
            rpcUrl: 'https://eth.drpc.org',
            knownContracts: {
                '0xc0a1a1e4af873e9a37a0cac37f3ab81152432cc5': 'USDT Bridge',
            },
        },
        {
            name: 'BSC',
            chainId: 56,
            rpcUrl: 'https://bsc-dataseed.binance.org',
            knownContracts: {},
        },
    ];
}
export async function trackDeposit(txHash, chains) {
    // Normalize tx hash
    const hash = txHash.startsWith('0x') ? txHash : `0x${txHash}`;
    // 1. Try all chains in parallel to find the receipt
    const results = await Promise.allSettled(chains.map(async (chain) => {
        const [receipt, tx] = await Promise.all([
            rpcCall(chain.rpcUrl, 'eth_getTransactionReceipt', [hash]),
            rpcCall(chain.rpcUrl, 'eth_getTransactionByHash', [hash]),
        ]);
        return { chain, receipt, tx };
    }));
    // 2. Find which chain has the tx
    let matched = null;
    let foundPending = null;
    for (const r of results) {
        if (r.status !== 'fulfilled')
            continue;
        const { chain, receipt, tx } = r.value;
        if (receipt) {
            matched = { chain, receipt, tx };
            break;
        }
        // tx found but no receipt → pending
        if (tx && tx.blockNumber === null) {
            foundPending = chain;
        }
    }
    // 3. Not found on any chain
    if (!matched && !foundPending) {
        return { status: 'not_found', txHash: hash, chain: 'unknown', chainId: 0 };
    }
    // 4. Pending (in mempool)
    if (!matched && foundPending) {
        return { status: 'pending', txHash: hash, chain: foundPending.name, chainId: foundPending.chainId };
    }
    const { chain, receipt, tx } = matched;
    const blockNumber = parseInt(receipt.blockNumber, 16);
    // 5. Failed tx
    if (receipt.status === '0x0') {
        return {
            status: 'failed',
            txHash: hash,
            chain: chain.name,
            chainId: chain.chainId,
            blockNumber,
        };
    }
    // 6. Success — parse details
    const result = {
        status: 'confirmed',
        txHash: hash,
        chain: chain.name,
        chainId: chain.chainId,
        blockNumber,
        to: receipt.to,
    };
    // Get timestamp
    result.timestamp = await getBlockTimestamp(chain.rpcUrl, receipt.blockNumber);
    // Identify contract
    const toAddr = receipt.to?.toLowerCase() ?? '';
    const contractName = chain.knownContracts[toAddr];
    // Parse logs and input data based on chain type
    if (chain.chainId === 3343 || chain.chainId === 33431) {
        // Edge chain — look for SpotVault.Deposit or RelayDepositSucceeded
        result.status = 'credited'; // If tx succeeded on Edge chain, funds are credited
        for (const log of receipt.logs) {
            const frontDeposit = parseFrontDepositToLog(log);
            if (frontDeposit) {
                const token = frontDeposit.token;
                const decimals = getDecimals(token);
                result.amount = hex2amount('0x' + BigInt(frontDeposit.amount).toString(16), decimals);
                result.accountId = frontDeposit.user; // Use user address for display
                result.asset = getAssetName(token);
                result.details = { ...frontDeposit, contract: contractName ?? toAddr, type: 'front_deposit_to' };
                break;
            }
            const spotDeposit = parseSpotVaultDepositLog(log);
            if (spotDeposit) {
                const token = spotDeposit.token;
                const decimals = getDecimals(token);
                result.amount = hex2amount('0x' + BigInt(spotDeposit.amount).toString(16), decimals);
                result.accountId = spotDeposit.accountId;
                result.asset = getAssetName(token);
                result.details = { ...spotDeposit, contract: contractName ?? toAddr, type: 'direct_deposit' };
                break;
            }
            const relay = parseRelayDepositLog(log);
            if (relay) {
                // CCTP relay is always USDC (6 decimals)
                result.amount = hex2amount('0x' + BigInt(relay.amount).toString(16), 6);
                result.asset = 'USDC';
                result.details = { ...relay, contract: 'CCTPVaultRelayer', type: 'cctp_relay' };
                break;
            }
        }
        // Fallback: parse input data
        if (!result.details && tx?.input) {
            const spotInput = parseSpotDepositInput(tx.input);
            if (spotInput) {
                const token = spotInput.token;
                const decimals = getDecimals(token);
                result.amount = hex2amount('0x' + BigInt(spotInput.amount).toString(16), decimals);
                result.accountId = spotInput.accountId;
                result.asset = getAssetName(token);
                result.details = { ...spotInput, type: 'direct_deposit' };
            }
        }
        // Fallback: parse ERC20 Transfer logs for amount
        if (!result.amount) {
            for (const log of receipt.logs) {
                const transfer = parseErc20TransferLog(log);
                if (transfer) {
                    const tokenAddr = log.address.toLowerCase();
                    const decimals = getDecimals(tokenAddr);
                    result.amount = hex2amount('0x' + BigInt(transfer.amount).toString(16), decimals);
                    result.asset = getAssetName(tokenAddr);
                    break;
                }
            }
        }
    }
    else {
        // Source chain (Arb/Eth/BSC) — tx confirmed on source, awaiting relay
        result.status = 'confirmed';
        // Parse bridge deposit input
        if (tx?.input) {
            const bridgeInput = parseBridgeDepositInput(tx.input);
            if (bridgeInput) {
                const token = bridgeInput.token;
                const decimals = getDecimals(token);
                result.amount = hex2amount('0x' + BigInt(bridgeInput.amount).toString(16), decimals);
                result.accountId = bridgeInput.starkKey;
                result.asset = getAssetName(token);
                result.details = { ...bridgeInput, contract: contractName ?? toAddr, type: 'cross_chain_deposit' };
            }
        }
        // Fallback: parse ERC20 Transfer logs for amount/token
        if (!result.amount) {
            for (const log of receipt.logs) {
                const transfer = parseErc20TransferLog(log);
                if (transfer && transfer.to.toLowerCase() === toAddr) {
                    const tokenAddr = log.address.toLowerCase();
                    const decimals = getDecimals(tokenAddr);
                    result.amount = hex2amount('0x' + BigInt(transfer.amount).toString(16), decimals);
                    result.asset = getAssetName(tokenAddr);
                    result.details = { ...transfer, contract: contractName ?? toAddr, type: 'cross_chain_deposit' };
                    break;
                }
            }
        }
    }
    return result;
}
//# sourceMappingURL=deposit-tracker.js.map