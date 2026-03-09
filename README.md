# edgex-cli

Command-line interface for [EdgeX](https://pro.edgex.exchange) perpetual contract trading.

Built for traders and AI agents. All commands support `--json` output for programmatic consumption.

## Features

- **Market data** — ticker, depth, kline, funding rates, long/short ratio, volume summary
- **Account** — balances, positions, orders, leverage, transaction history, snapshots
- **Trading** — limit/market orders with TP/SL, cancel, batch cancel, max order size
- **Asset management** — withdrawals, deposit tracking, spot vault balance
- **Transfers** — internal transfers, cross-chain withdrawals
- **WebSocket streaming** — real-time ticker, depth, kline, trades, account updates (NDJSON)
- **Deposit tracking** — on-chain deposit status across Edge, Arbitrum, Ethereum, BSC (no auth required)
- **Testnet support** — `--testnet` flag for safe testing with isolated config
- **AI-ready** — MCP server for Claude/Cursor, `--json` output for any LLM agent
- **Security** — sub-account warnings, chmod 600 config, order confirmation prompts

## Install

```bash
npm install -g https://github.com/andy-edgex/edgex-cli/tarball/master
```

Or from source:

```bash
git clone https://github.com/andy-edgex/edgex-cli.git
cd edgex-cli
npm install --omit=dev
npm link
```

Requires **Node.js >= 18**.

Verify installation:

```bash
edgex --version
edgex --help
```

## Setup

Market data commands work without authentication. For trading, account, and asset commands, you need to configure your credentials.

### Step 1: Get credentials

1. Go to [EdgeX](https://pro.edgex.exchange) (or [Testnet](https://testnet.edgex.exchange))
2. Export your **Account ID** and **StarkEx Private Key** from the web interface

### Step 2: Configure the CLI

```bash
# Interactive setup (recommended)
edgex setup

# Non-interactive
edgex setup --account-id YOUR_ID --private-key YOUR_KEY
```

Configuration is stored in `~/.edgex/config.json` (chmod 600 on Unix).

### Environment variables

Environment variables override the config file:

```bash
export EDGEX_ACCOUNT_ID=12345
export EDGEX_STARK_PRIVATE_KEY=0x...
export EDGEX_BASE_URL=https://pro.edgex.exchange    # optional
export EDGEX_WS_URL=wss://quote.edgex.exchange      # optional
```

## Commands

### Global options

| Option | Description |
|--------|-------------|
| `--json` | Output in JSON format (for scripting/AI) |
| `--testnet` | Use testnet environment |
| `-V, --version` | Print version |
| `-h, --help` | Show help |

---

### `market` — Market data (no auth required)

```bash
edgex market ticker [symbol]           # 24h ticker (omit symbol for all contracts)
edgex market depth <symbol>            # Order book depth
edgex market kline <symbol>            # Candlestick data
edgex market funding [symbol]          # Funding rates
edgex market summary                   # Market-wide volume summary
edgex market ratio [symbol]            # Long/short ratio by exchange
```

**Options:**

| Command | Option | Description |
|---------|--------|-------------|
| `depth` | `-l, --level <15\|200>` | Depth levels (default: 15) |
| `kline` | `-i, --interval <interval>` | `1m` `5m` `15m` `30m` `1h` `2h` `4h` `6h` `8h` `12h` `1d` `1w` `1M` (default: 1h) |
| `kline` | `-n, --limit <count>` | Number of bars (default: 20) |

**Examples:**

```bash
edgex market ticker                    # All tickers
edgex market ticker BTC                # BTC ticker only
edgex market depth ETH --level 200     # Full ETH order book
edgex market kline SOL -i 5m -n 50    # 50 five-minute candles for SOL
edgex market funding                   # All funding rates
edgex market ratio BTC                 # BTC long/short ratio

# JSON output for scripting
edgex --json market ticker BTC | jq '.[] | .lastPrice'
```

---

### `account` — Account info (requires auth)

```bash
edgex account balances                 # Asset balances & equity
edgex account positions                # Open positions
edgex account orders                   # Active orders
edgex account leverage <symbol> <n>    # Set leverage multiplier
edgex account position-txs             # Position transaction history
edgex account collateral-txs           # Collateral transaction history
edgex account position-terms           # Closed position history
edgex account snapshots                # Account asset snapshots
edgex account deleverage               # Deleverage light status
edgex account info                     # Account details
```

**Options:**

| Command | Option | Description |
|---------|--------|-------------|
| `orders` | `-s, --symbol <symbol>` | Filter by symbol |
| `orders` | `-n, --size <count>` | Page size (default: 50) |
| `position-txs` | `-s, --symbol <symbol>` | Filter by symbol |
| `position-txs` | `-n, --size <count>` | Page size (default: 10) |
| `collateral-txs` | `-n, --size <count>` | Page size (default: 10) |
| `position-terms` | `-s, --symbol <symbol>` | Filter by symbol |
| `position-terms` | `-n, --size <count>` | Page size (default: 10) |
| `snapshots` | `-n, --size <count>` | Page size (default: 10) |

**Examples:**

```bash
edgex account balances
edgex account positions
edgex account orders -s BTC
edgex account leverage ETH 10         # Set ETH to 10x leverage
edgex account position-txs -s SOL -n 20
```

---

### `order` — Trading (requires auth)

```bash
edgex order create <symbol> <side> <type> <size>   # Place order
edgex order status <orderId>                        # Query order status
edgex order cancel <orderId>                        # Cancel order(s)
edgex order cancel-all                              # Cancel all open orders
edgex order cancel-client <clientOrderIds>          # Cancel by client order ID
edgex order max-size <symbol>                       # Query max order size
edgex order fills                                   # Fill transaction history
```

**`order create` options:**

| Option | Description |
|--------|-------------|
| `--price <price>` | Limit price (required for limit orders) |
| `--tp <price>` | Take-profit price |
| `--sl <price>` | Stop-loss price |
| `--client-id <id>` | Custom client order ID |
| `-y, --yes` | Skip confirmation prompt |

**`order cancel-all` options:**

| Option | Description |
|--------|-------------|
| `-s, --symbol <symbol>` | Cancel only orders for this symbol |

**`order max-size` options:**

| Option | Description |
|--------|-------------|
| `--price <price>` | Limit price for size calculation |

**`order fills` options:**

| Option | Description |
|--------|-------------|
| `-s, --symbol <symbol>` | Filter by symbol |
| `-n, --size <count>` | Page size (default: 20) |

**Examples:**

```bash
# Limit order (prompts for confirmation)
edgex order create BTC buy limit 0.01 --price 60000

# Market order
edgex order create SOL sell market 1

# With take-profit and stop-loss
edgex order create ETH buy limit 0.1 --price 3000 --tp 3500 --sl 2800

# Skip confirmation prompt
edgex order create BTC buy limit 0.01 --price 60000 -y

# Cancel single order
edgex order cancel 123456789

# Cancel multiple orders (comma-separated)
edgex order cancel 111,222,333

# Cancel all BTC orders
edgex order cancel-all -s BTC

# Check max position size
edgex order max-size SOL

# View fill history for ETH
edgex order fills -s ETH -n 50
```

---

### `asset` — Asset & withdrawal management (requires auth)

```bash
edgex asset orders                     # Asset order history (deposits, withdrawals, transfers)
edgex asset coin-rate                  # Coin exchange rate
edgex asset withdraw <coinId> <amount> <ethAddress>   # Create L2 withdrawal
edgex asset withdraw-history           # Withdrawal records
edgex asset withdrawable <address>     # Withdrawable amount for a coin
edgex asset spot-balance               # Spot vault USDC balance (on-chain RPC)
```

**Options:**

| Command | Option | Description |
|---------|--------|-------------|
| `orders` | `-n, --size <count>` | Page size (default: 10) |
| `coin-rate` | `--chain <chainId>` | Chain ID (default: 1) |
| `coin-rate` | `--coin <address>` | Coin contract address |
| `withdraw-history` | `-n, --size <count>` | Page size (default: 10) |
| `spot-balance` | `--rpc <url>` | Edge chain RPC URL |

**Examples:**

```bash
edgex asset orders -n 20
edgex asset withdraw 1000 100 0xYourEthAddress
edgex asset withdraw-history
edgex asset spot-balance
```

---

### `transfer` — Transfer management (requires auth)

```bash
edgex transfer available <coinId>      # Transferable amount
edgex transfer create <coinId> <amount> <receiverAccountId> <receiverL2Key>
edgex transfer out-history             # Transfer out history
edgex transfer in-history              # Transfer in history
edgex transfer cross-withdraw <amount> <ethAddress>   # Cross-chain withdraw
edgex transfer lookup <in|out> <ids>   # Lookup transfer by ID
```

**`transfer cross-withdraw` options:**

| Option | Description |
|--------|-------------|
| `--chain-id <id>` | Target chain (42161=Arbitrum, 3343=Edge, default: 42161) |
| `--coin <coinId>` | Coin ID (default: 1000) |

**Examples:**

```bash
edgex transfer available 1000
edgex transfer out-history -n 20
edgex transfer cross-withdraw 100 0xYourEthAddress --chain-id 42161
edgex transfer lookup out 123456
```

---

### `deposit-status` — Deposit tracking (no auth required)

Track deposit status by transaction hash. Queries on-chain RPCs across Edge Chain, Arbitrum, Ethereum, and BSC — no backend API or authentication needed.

```bash
edgex deposit-status <txHash>
edgex deposit-status <txHash> --chain edge    # Only query Edge Chain
edgex deposit-status <txHash> --chain arb     # Only query Arbitrum
edgex deposit-status <txHash> --json          # JSON output
```

**Status values:**

| Status | Description |
|--------|-------------|
| `not_found` | Transaction not found on any chain |
| `pending` | Transaction in mempool, awaiting confirmation |
| `failed` | Transaction reverted |
| `confirmed` | Confirmed on source chain, awaiting CCTP relay |
| `credited` | Funds credited on Edge Chain |

**Examples:**

```bash
# Track any deposit with just the tx hash
edgex deposit-status 0xabc123...

# Check only on Arbitrum
edgex deposit-status 0xabc123... --chain arb
```

---

### `stream` — WebSocket streaming

Streams output NDJSON (one JSON object per line), ideal for piping to other tools.

```bash
edgex stream ticker <symbol>           # Real-time ticker updates
edgex stream depth <symbol>            # Real-time order book
edgex stream kline <symbol>            # Real-time candlestick
edgex stream trades <symbol>           # Real-time trades
edgex stream account                   # Account/order/position updates (requires auth)
```

**Options:**

| Command | Option | Description |
|---------|--------|-------------|
| `depth` | `-l, --level <15\|200>` | Depth levels (default: 15) |
| `kline` | `-i, --interval <interval>` | Kline interval (default: 1m) |

All streams run until interrupted with `Ctrl+C`.

**Examples:**

```bash
# Stream BTC ticker, pipe to jq for live price
edgex stream ticker BTC | jq '.lastPrice'

# Stream ETH order book
edgex stream depth ETH

# Stream 5-minute candles for SOL
edgex stream kline SOL -i 5m

# Stream account updates (fills, position changes)
edgex stream account
```

---

### `test` — Regression test runner

```bash
edgex test list                        # List available test suites
edgex test run [suite...]              # Run test suite(s)
```

---

## Symbol Resolution

The CLI accepts flexible symbol inputs:

| Input | Resolves To |
|-------|-------------|
| `BTC`, `btc`, `BTCUSD` | BTC-USDC perpetual |
| `ETH`, `ETHUSD` | ETH-USDC perpetual |
| `SOL`, `TSLA`, `NVDA`, `AAPL` | Respective perpetuals |
| `10000001` | Full contract ID (also accepted) |

Contract metadata is cached locally at `~/.edgex/contracts.json` (1-hour TTL).

## Testnet

Add `--testnet` to any command to use the testnet environment:

```bash
edgex --testnet setup
edgex --testnet market ticker BTC
edgex --testnet order create BTC buy limit 0.001 --price 60000
```

Testnet uses a separate config file (`~/.edgex/config-testnet.json`) and contract cache, completely isolated from mainnet.

## JSON Output

Add `--json` to any command for machine-readable JSON output:

```bash
# Pipe to jq
edgex --json market ticker BTC | jq '.[0].lastPrice'

# Save to file
edgex --json account positions > positions.json

# Use in shell scripts
PRICE=$(edgex --json market ticker BTC | jq -r '.[0].lastPrice')
echo "BTC price: $PRICE"
```

## HTTP Proxy

The CLI auto-detects `HTTPS_PROXY` / `HTTP_PROXY` environment variables:

```bash
export HTTPS_PROXY=http://127.0.0.1:10080
edgex market ticker BTC    # Routes through proxy
```

## Security

- **Sub-account warning** — Setup displays a security banner recommending sub-account keys
- **File permissions** — Config files are created with chmod 600 (owner-only read/write)
- **Order confirmation** — All orders require interactive confirmation before submission (use `-y` to skip)
- **Market order warning** — Extra warning for market orders due to slippage risk
- **Environment variables** — Credentials can be passed via env vars instead of storing on disk

## Rate Limiting

The CLI respects EdgeX API rate limits (50 requests per 10 seconds) with automatic sliding-window throttling.

## MCP Server (AI Integration)

The CLI includes a built-in [MCP](https://modelcontextprotocol.io/) server for integration with AI tools like Claude and Cursor:

```bash
edgex serve-mcp    # Start MCP server on stdio
```

### Claude Desktop / Cursor configuration

Add to your MCP config (`~/.config/claude/claude_desktop_config.json` or Cursor settings):

```json
{
  "mcpServers": {
    "edgex": {
      "command": "edgex",
      "args": ["serve-mcp"]
    }
  }
}
```

This gives your AI assistant access to all EdgeX trading tools — market data, account info, order placement, deposit tracking, and more.

## AI Agent Examples

Copy any prompt below and paste it to your AI assistant (Cursor, Claude, ChatGPT, etc.). The AI will use the CLI to complete the task.

### Beginner — Single-step prompts

```text
What's the current price of BTC?
```

```text
Show my account balance.
```

```text
Place a BTC limit buy order at 60000, size 0.01.
```

```text
Market sell 0.1 ETH.
```

```text
What's the max BTC position I can open right now?
```

```text
Do I have any open positions? If so, close them all.
```

```text
Do I have any pending orders? If so, cancel them all.
```

### Intermediate — Multi-step analysis

```text
Compare BTC, ETH, and SOL — show price and 24h change in a table.
```

```text
I want to buy some SOL. Check the current price, minimum order size, and my balance.
Tell me if I can afford it.
```

```text
Check BTC order book depth and funding rate. Tell me whether bulls or bears are in control.
```

```text
Show PnL for all my open positions with current market prices. Close any position with loss > 5%.
```

### Advanced — Complex workflows

```text
Use edgex-cli to give me a market snapshot:
1. Get the current price of BTC, ETH, and SOL (edgex --json market ticker <symbol>)
2. Get the order book depth for BTC (edgex --json market depth BTC)
3. Get the funding rate for BTC (edgex --json market funding BTC)

Summarize everything in a clean table: asset, price, 24h change%, bid/ask spread, funding rate.
```

```text
Use edgex-cli to pull the last 50 hourly candles for BTC:
  edgex --json market kline BTC -i 1h -n 50

Then calculate and report:
- Current price vs 24h high/low
- Approximate support/resistance levels from the candle data
- Whether the trend is bullish or bearish based on recent price action
- A 1-paragraph trading outlook
```

```text
Use edgex-cli to build me a portfolio dashboard:
1. Get my balances: edgex --json account balances
2. Get my open positions: edgex --json account positions
3. Get my active orders: edgex --json account orders
4. For each position, get the current market price: edgex --json market ticker <symbol>

Present a dashboard showing:
- Total equity and available balance
- Each position with entry price, current price, unrealized PnL, and PnL%
- All pending orders
```

```text
I want to open a small long position on SOL. Use edgex-cli to:

1. Check my balance: edgex --json account balances
2. Check SOL price: edgex --json market ticker SOL
3. Check max order size: edgex --json order max-size SOL
4. Check SOL funding rate: edgex --json market funding SOL

Based on the data:
- Confirm I have enough balance
- Calculate the minimum position size and its dollar value
- Show me the funding cost per day
- If everything looks OK, suggest the exact order command with appropriate TP/SL levels
  (TP at +5%, SL at -3%) but do NOT execute it — just show me the command to review.
```

## Architecture

```
src/
  index.ts              # CLI entry (Commander.js) + --testnet/--json globals
  core/
    client.ts           # REST API client (public + authenticated)
    auth.ts             # StarkEx ECDSA signing (API authentication)
    l2-signer.ts        # L2 order/transfer/withdrawal signing
    config.ts           # Config management (mainnet/testnet isolation)
    symbols.ts          # Symbol resolver + cache (BTC → contractId)
    rate-limiter.ts     # Sliding-window rate limiter
    ws.ts               # WebSocket manager (auto-reconnect + ping/pong)
    proxy.ts            # HTTP proxy support (HTTPS_PROXY auto-detection)
    deposit-tracker.ts  # On-chain deposit status tracker (multi-chain RPC)
    order-service.ts    # Order payload builder
    types.ts            # TypeScript type definitions
  commands/
    setup.ts            # edgex setup
    market.ts           # edgex market (ticker, depth, kline, funding, summary, ratio)
    account.ts          # edgex account (balances, positions, orders, leverage, history)
    order.ts            # edgex order (create, cancel, status, max-size, fills)
    asset.ts            # edgex asset (withdraw, spot-balance, coin-rate)
    transfer.ts         # edgex transfer (internal transfers, cross-chain withdraw)
    deposit-status.ts   # edgex deposit-status (on-chain tracking)
    stream.ts           # edgex stream (WebSocket, NDJSON output)
    test.ts             # edgex test (regression test runner)
  mcp/
    server.ts           # MCP server (AI tool integration)
    resources.ts        # MCP resources
  utils/
    output.ts           # JSON / table output formatting
    errors.ts           # Error types and handling
```

## Development

```bash
git clone https://github.com/andy-edgex/edgex-cli.git
cd edgex-cli
npm install
npm run dev -- market ticker BTC    # Run via tsx (no build needed)
npm run build                       # Compile TypeScript
npm run typecheck                   # Type check without emitting
```

## License

MIT
