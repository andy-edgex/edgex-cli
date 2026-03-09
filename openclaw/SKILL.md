---
name: edgex-cli
description: Trade perpetual and equity contracts on EdgeX exchange via CLI. Query market data (price, depth, funding, kline, long/short ratio), manage accounts (balance, positions, leverage), place/cancel orders with TP/SL, transfer funds, view asset/withdraw history, and run regression tests. Stream real-time WebSocket data. Supports 290+ contracts including crypto (BTC, ETH, SOL) and US equities (TSLA, AAPL, NVDA). Use this skill whenever the user mentions EdgeX, wants to check crypto or stock prices on EdgeX, place trades, view positions or balances, analyze funding rates, monitor order books, or do any kind of market analysis using EdgeX data — even if they don't explicitly say "EdgeX CLI". Also trigger for requests like "check BTC price", "open a long on SOL", "what's my PnL", "scan funding rates", "close my positions", or "show market depth", when the context involves EdgeX.
---

# EdgeX CLI

CLI for EdgeX perpetual and equity contract trading. All commands support `--json` for structured output.

## Install

```bash
npm install -g @realnaka/edgex-cli
```

Requires Node.js >= 18. Verify: `edgex --version`

## Capabilities & Limits

**Public (no auth):** market ticker/depth/kline/funding/ratio/summary, stream ticker/depth/kline/trades
**Authenticated (requires `edgex setup`):** account balances/positions/orders/leverage, order create/cancel/status/max-size, transfers, asset orders, withdraw history, stream account
**Testing:** list and run regression test suites with structured JSON output
**Assets:** 290+ perpetual contracts — crypto (BTC, ETH, SOL) + US equities (TSLA, AAPL, NVDA, GOOG, AMZN, META)

**Cannot do:** withdraw funds, transfer between accounts, modify TP/SL after creation, change account settings

## Commands

```
edgex market ticker [symbol] --json          # 24h ticker (price, volume, OI, funding)
edgex market depth <symbol> --json           # Order book (--level 15|200)
edgex market kline <symbol> -i <interval> -n <count> --json   # Candlesticks
edgex market funding [symbol] --json         # Funding rates
edgex market summary --json                  # Market-wide stats
edgex market ratio [symbol] --json           # Long/short ratio by exchange

edgex account balances --json                # Asset balances
edgex account positions --json               # Open positions
edgex account orders --json                  # Active orders
edgex account info --json                    # Full account info
edgex account leverage <symbol> <n> --json   # Set leverage (cross-margin)

edgex order create <symbol> <buy|sell> <limit|market> <size> [--price X] [--tp X] [--sl X] [-y] --json
edgex order status <orderId> --json
edgex order cancel <orderId> --json
edgex order cancel-by-client-id <clientOrderId> --json
edgex order cancel-all [-s <symbol>] --json
edgex order max-size <symbol> --json         # Max position size given current balance
edgex order fills [--symbol X] --json        # Fill/trade history

edgex transfer available --json              # Available transfer amount
edgex transfer out-history --json            # Transfer-out history
edgex transfer in-history --json             # Transfer-in history

edgex asset orders --json                    # Asset order history
edgex asset withdraw-history --json          # Withdraw history
edgex asset withdrawable --json              # Withdrawable amount
edgex asset coin-rate --json                 # Coin exchange rates

edgex stream ticker <symbol>                 # Real-time ticker (NDJSON)
edgex stream depth <symbol>                  # Real-time order book (NDJSON)
edgex stream kline <symbol> -i <interval>    # Real-time kline (NDJSON)
edgex stream trades <symbol>                 # Real-time trades (NDJSON)
edgex stream account                         # Account/order updates (NDJSON, requires auth)

edgex test list [suite]                      # List test suites or cases within a suite
edgex test run [suites...] --json            # Run regression test suites
```

**Kline intervals:** 1m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d, 1w, 1M

**Symbol format:** Flexible — `BTC`, `btc`, `BTCUSD`, or contract ID `10000001` all work.

**Flags:** `--testnet` for testnet environment. `--json` for JSON output. `-y` to skip order confirmation.

## Agent Rules

**Output parsing:** Use `--json` on every command. Without it, the CLI outputs human-readable tables that are unreliable to parse programmatically. The flag works in either position: `edgex --json market ticker BTC` and `edgex market ticker BTC --json` are equivalent.

**Pre-trade safety:** Check `account balances` and `order max-size` before placing any order. Skipping these risks rejection (insufficient margin) or placing an order larger than the account can support — both waste the user's time and erode trust.

**User confirmation:** Present order parameters (symbol, side, type, size, price, TP/SL) and wait for explicit confirmation before using `-y`. Trading involves real money — an accidental order can cause immediate financial loss. Never auto-confirm on the user's behalf.

**Market order warning:** Market orders execute at whatever price is available, and thin order books can cause significant slippage. Warn the user about this before proceeding — especially for large sizes or low-liquidity contracts.

**Auth status check:** Call `edgex_get_auth_status` (or `edgex account balances --json`) at the start of a session to verify credentials are configured. If not, instruct the user to run `edgex setup`.

**Data format notes:**
- All numeric values are returned as **strings** — parse with `parseFloat()`
- Funding rate is a decimal: `"0.0001"` means 0.01%
- Timestamps are Unix milliseconds as strings

## Core Workflows

### Safe Order Placement

1. Check balance: `edgex --json account balances` → read `.collateralAssetModelList[0].availableAmount`
2. Check price: `edgex --json market ticker <symbol>` → read `[0].lastPrice`
3. Check max size: `edgex --json order max-size <symbol>` → read `.maxBuySize` or `.maxSellSize`
4. Validate: available balance sufficient? requested size ≤ max size?
5. Present order preview to user: symbol, side, type, size, price, TP/SL
6. After user confirms → execute: `edgex order create <symbol> <side> <type> <size> [--price X] -y --json`
7. Verify: `edgex --json order status <orderId>`

### Close All Positions

1. Get positions: `edgex --json account positions`
2. For each position with non-zero size: determine reverse side and size
3. Execute: `edgex order create <symbol> <reverse-side> market <size> -y --json`

### Market Analysis

1. Get ticker: `edgex --json market ticker <symbol>` (price, 24h change, volume, OI)
2. Get depth: `edgex --json market depth <symbol>` (bid/ask spread, liquidity)
3. Get funding: `edgex --json market funding <symbol>` (funding rate, sentiment)
4. Get kline: `edgex --json market kline <symbol> -i 1h -n 50` (price history)
5. Combine into analysis: trend direction, support/resistance, funding cost

### Regression Testing

1. List suites: `edgex --json test list` → see available test suites with case counts
2. Run specific: `edgex --json test run tc_acc tc_trd` → structured pass/fail results
3. Run all: `edgex --json test run all` → full regression

## EdgeX-Specific Rules

- **Cross-margin only** by default. All positions in one account share collateral. To isolate risk, create sub-accounts on the EdgeX web interface.
- **USDT collateral only.** Margin and PnL calculated in USDT.
- **Funding every 1-4 hours** (varies by contract). Check `fundingRateIntervalMin` in funding response.
- **Stock perpetuals during market closure** (weekends/holidays): market orders are REJECTED. Only limit orders within a price range are allowed. See [references/trading-rules.md](references/trading-rules.md) for details.
- **TP/SL execute as market orders** and are reduce-only by default.
- **Oracle Price** (from Stork) is used for liquidation, not last traded price.
- **Rate limit:** 50 requests per 10 seconds (CLI auto-throttles).

## Error Recovery

| Error | Cause | Fix |
|-------|-------|-----|
| "Run edgex setup" | No credentials configured | Run `edgex setup` |
| "Unknown symbol: XXX" | Symbol not found in cache | `rm ~/.edgex/contracts.json` and retry |
| "INSUFFICIENT_MARGIN" | Not enough balance | Reduce size or deposit more USDT |
| "INVALID_ORDER_MARKET_PRICE" | Market order during stock closure | Use limit order within allowed price range |
| "Order rejected" | Price outside allowed range | Check funding response for price limits |
| Rate limit exceeded | Too many requests | CLI auto-waits; or add delay between commands |

## Reference Files

- **Output schemas**: See [references/output-schemas.md](references/output-schemas.md) for complete JSON response structures of every command
- **Trading rules**: See [references/trading-rules.md](references/trading-rules.md) for EdgeX margin, liquidation, stock perpetual, order types, fees, and price mechanisms
- **Advanced workflows**: See [references/workflows.md](references/workflows.md) for multi-asset monitoring, portfolio dashboard, funding scanner, and smart order workflows
