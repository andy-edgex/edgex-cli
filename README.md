# edgex-cli

Command-line interface for [EdgeX](https://pro.edgex.exchange) perpetual contract trading.

Built for traders and AI agents. All commands support `--json` output for programmatic consumption.

## Features

- **Market data** — ticker, depth, kline, funding, long/short ratio
- **Account** — balances, positions, orders, leverage
- **Trading** — limit/market orders with TP/SL, cancel, batch cancel
- **WebSocket streaming** — real-time ticker, depth, kline, trades, account updates (NDJSON)
- **Testnet support** — `--testnet` flag for safe testing
- **Security** — sub-account warnings, chmod 600, order confirmation prompts

## Install

```bash
npm install -g @realnaka/edgex-cli
```

Or from source:

```bash
git clone https://github.com/realnaka/edgex-cli.git
cd edgex-cli
npm install
npm run build    # required — compiles TypeScript to dist/
npm link         # makes "edgex" command available globally
```

Requires Node.js >= 18.

## Quick Start

```bash
# Market data (no auth required)
edgex market ticker BTC
edgex market depth ETH
edgex market kline BTC -i 1h -n 20
edgex market funding BTC
edgex market ratio BTC

# JSON output for scripting / AI agents
edgex market ticker BTC --json | jq '.lastPrice'
```

## Setup

Export your Account ID and StarkEx Private Key from the [EdgeX web interface](https://pro.edgex.exchange).

```bash
# Interactive setup (recommended)
edgex setup

# Non-interactive
edgex setup --account-id YOUR_ID --private-key YOUR_KEY
```

Configuration is stored in `~/.edgex/config.json` (chmod 600 on Unix).

Environment variables override config file:

```bash
export EDGEX_ACCOUNT_ID=12345
export EDGEX_STARK_PRIVATE_KEY=0x...
export EDGEX_BASE_URL=https://pro.edgex.exchange    # optional
export EDGEX_WS_URL=wss://quote.edgex.exchange      # optional
```

## Commands

### Market Data (public)

```bash
edgex market ticker [symbol]           # 24h ticker
edgex market depth <symbol>            # Order book (--level 15|200)
edgex market kline <symbol>            # Kline (-i 1m/5m/15m/1h/4h/1d, -n count)
edgex market funding [symbol]          # Funding rates
edgex market summary                   # Market-wide volume summary
edgex market ratio [symbol]            # Long/short ratio by exchange
```

### Account (requires setup)

```bash
edgex account balances                 # Asset balances
edgex account positions                # Open positions
edgex account orders                   # Active orders
edgex account leverage <symbol> <n>    # Set leverage
```

### Trading (requires setup)

```bash
# Limit order with confirmation prompt
edgex order create BTC buy limit 0.01 --price 60000

# Market order (warns about slippage)
edgex order create SOL sell market 1

# With take-profit / stop-loss
edgex order create ETH buy limit 0.1 --price 3000 --tp 3500 --sl 2800

# Skip confirmation (-y)
edgex order create BTC buy limit 0.01 --price 60000 -y

# Order management
edgex order status <orderId>
edgex order cancel <orderId>
edgex order cancel-all [-s BTC]
edgex order max-size <symbol>
```

### WebSocket Streaming

Streams output NDJSON (one JSON object per line), ideal for piping:

```bash
edgex stream ticker BTC                # Real-time ticker
edgex stream depth ETH                 # Real-time order book
edgex stream kline BTC -i 5m           # Real-time kline
edgex stream trades SOL                # Real-time trades
edgex stream account                   # Account/order updates (requires auth)
```

## Testnet

Add `--testnet` to any command to use the testnet environment:

```bash
edgex --testnet setup
edgex --testnet market ticker BTC
edgex --testnet order create BTC buy limit 0.001 --price 60000
```

Testnet uses separate config (`~/.edgex/config-testnet.json`) and contract cache.

## Symbol Resolution

Flexible symbol inputs:

- `BTC`, `btc`, `BTCUSD` → contract `10000001`
- `ETH`, `ETHUSD` → contract `10000002`
- Full contract IDs (e.g. `10000001`) also accepted

Contract metadata is cached locally (`~/.edgex/contracts.json`, 1 hour TTL).

## Security

- **Sub-account warning**: Setup displays a security banner recommending sub-account keys
- **File permissions**: Config files are created with chmod 600 (owner-only)
- **Order confirmation**: All orders require confirmation before submission (`-y` to skip)
- **Market order warning**: Extra warning for market orders (slippage risk)
- **Environment variables**: Credentials can be passed via env vars instead of config files

## Rate Limiting

The CLI respects EdgeX API rate limits (50 requests per 10 seconds) with automatic sliding-window throttling.

## Architecture

```
src/
  index.ts              # CLI entry (Commander.js) + --testnet/--json globals
  core/
    client.ts           # REST API client (public + authenticated)
    auth.ts             # StarkEx ECDSA signing (API authentication)
    l2-signer.ts        # L2 order signing (Pedersen hash + StarkEx ECDSA)
    types.ts            # TypeScript type definitions
    symbols.ts          # Symbol resolver + cache (BTC → contractId)
    rate-limiter.ts     # Sliding-window rate limiter
    ws.ts               # WebSocket manager (auto-reconnect + ping/pong)
    config.ts           # Config management (mainnet/testnet isolation)
  commands/
    setup.ts            # edgex setup (interactive + non-interactive)
    market.ts           # edgex market (6 subcommands)
    account.ts          # edgex account (balances/positions/orders/leverage)
    order.ts            # edgex order (create/cancel/status/max-size)
    stream.ts           # edgex stream (WebSocket, NDJSON output)
  utils/
    output.ts           # JSON / table output formatting
    errors.ts           # Error types and handling
```

## Development

```bash
npm install
npm run dev -- market ticker BTC    # Run via tsx (no build needed)
npm run build                       # Compile TypeScript
npm run typecheck                   # Type check without emitting
```

## License

MIT
