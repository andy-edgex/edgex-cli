# EdgeX CLI

CLI for EdgeX perpetual and equity contract trading. Query market data, manage accounts, and execute trades from the terminal. All commands output JSON for AI agent integration.

## Installation

```bash
npm install -g edgex-cli
```

## Capabilities

### Market Data (no authentication required)

- **Ticker**: Get 24-hour price, volume, and open interest for any contract
- **Order Book**: View bid/ask depth at 15 or 200 levels
- **Kline**: Historical candlestick data with configurable intervals (1m to 1M)
- **Funding Rate**: Current and historical funding rates
- **Long/Short Ratio**: Multi-exchange long/short ratio analysis
- **Market Summary**: Aggregate market statistics

### Account Management (requires EdgeX credentials)

- View account balances, positions, and active orders
- Set leverage per contract (cross-margin mode)

### Trading (requires EdgeX credentials)

- Place limit and market orders with optional TP/SL
- Cancel individual orders or all open orders
- Query maximum order size

### Real-time Streaming (WebSocket)

- Stream live ticker, order book, and kline data
- Stream private account and order updates

## Usage

All commands support `--json` flag for structured output.

```bash
# Market data
edgex market ticker BTC --json
edgex market depth ETH --json
edgex market kline SOL -i 1h -n 50 --json
edgex market funding --json
edgex market ratio BTC --json

# Account
edgex account balances --json
edgex account positions --json

# Trading
edgex order create BTC buy market 0.01 --json
edgex order cancel <orderId> --json
```

## Symbol Format

Accepts flexible inputs: `BTC`, `btc`, `BTCUSD`, or contract ID `10000001`.

## Configuration

Credentials via environment variables or `~/.edgex/config.json`:

```bash
export EDGEX_ACCOUNT_ID=12345
export EDGEX_STARK_PRIVATE_KEY=0x...
```

## Contracts

EdgeX supports 290+ perpetual contracts including crypto (BTC, ETH, SOL, etc.) and US equity contracts.

## AI Agent Best Practices

When using this tool as an AI agent, follow these standard operating procedures:

1. **Pre-trade Checks**: Always execute `edgex account balances --json` to verify sufficient funds before attempting to place any orders.
2. **Market Order Volatility**: BE EXTREMELY CAREFUL with `market` orders. Always check `edgex market depth <symbol> --json` before executing large market orders to avoid catastrophic slippage.
3. **Calculation First**: For precise position sizing, always query `edgex market ticker <symbol> --json` and `edgex order max-size <symbol> --json` to perform math *before* constructing the `order create` command.
4. **State Verification**: After placing an order, query `edgex account positions --json` or `edgex account orders --json` to confirm the transaction state.

## Error Recovery Guide

If you receive a JSON output with `"success": false` and an `"error"` message, use these heuristics to self-correct:

- **`INSUFFICIENT_FUNDS` or similar terminology**: The order size is too large for the available margin. Run `edgex account balances --json` to check available capital, and reduce the `--size` parameter.
- **`Unknown symbol`**: The contract ticker you provided does not exist. Verify the ticker using external knowledge or use the ID instead.
- **`--price is required for limit orders`**: You attempted to place a `limit` order without specifying the price. Add `--price <value>` to your command.
- **Network/Timeout Errors**: The EdgeX API or WebSocket may be temporarily down. Wait 5-10 seconds and retry the read-only command. Provide the user with a status update if it persists.
