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
git clone https://github.com/andy-edgex/edgex-cli.git
cd edgex-cli
npm install --omit=dev
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

## AI Agent Examples

Copy any prompt below and paste it to your AI assistant (Cursor, Claude, ChatGPT, etc.). The AI will use the CLI to complete the task.

### Beginner — Single-step prompts

Simple one-liners to get started. / 一句话即可上手。

```text
What's the current price of BTC?
# 中文: BTC 现在多少钱？
```

```text
Check the price of ETH and SOL.
# 中文: 查一下 ETH 和 SOL 的价格。
```

```text
Show my account balance.
# 中文: 查看我的账户余额。
```

```text
Market buy BTC with the minimum order size.
# 中文: 帮我用最小数量市价买入 BTC。
```

```text
Place a BTC limit buy order at 60000, size 0.01.
# 中文: 帮我以 60000 的价格挂一个 BTC 限价买单，数量 0.01。
```

```text
Market sell 0.1 ETH.
# 中文: 帮我市价卖出 0.1 个 ETH。
```

```text
What's the max BTC position I can open right now?
# 中文: 我现在最多能开多大的 BTC 仓位？
```

```text
Do I have any open positions? If so, close them all.
# 中文: 我现在有没有持仓？有的话帮我全部平掉。
```

```text
Do I have any pending orders? If so, cancel them all.
# 中文: 我有没有挂着的订单？有的话全部取消。
```

```text
Place a SOL limit buy with TP at +5% and SL at -3%.
# 中文: 帮我下一个 SOL 的限价买单，带上止盈止损。止盈设 +5%，止损设 -3%。
```

### Intermediate — Multi-step analysis

Combine a few commands to make informed decisions. / 组合多个命令做出判断。

```text
Compare BTC, ETH, and SOL — show price and 24h change in a table.
# 中文: 帮我对比一下 BTC、ETH、SOL 的价格和涨跌幅，整理成表格。
```

```text
I want to buy some SOL. Check the current price, minimum order size, and my balance. Tell me if I can afford it.
# 中文: 我想买一点 SOL，帮我查一下当前价格、最小下单量和我的余额，告诉我能不能买。
```

```text
Check BTC order book depth and funding rate. Tell me whether bulls or bears are in control.
# 中文: 帮我查看 BTC 的盘口深度和 funding rate，告诉我现在多空哪边更强。
```

```text
Place a BTC limit buy 2% below the current price, use minimum size. Show me the parameters before executing.
# 中文: 帮我挂一个 BTC 的限价买单，价格比当前价低 2%，数量用最小值。下单前告诉我具体参数让我确认。
```

```text
Show PnL for all my open positions with current market prices. Close any position with loss > 5%.
# 中文: 帮我看看我所有持仓的盈亏情况，附上当前市价。如果有亏损超过 5% 的仓位，帮我平掉。
```

### Advanced — Complex workflows

#### Market Snapshot

```text
Use edgex-cli to give me a market snapshot:
1. Get the current price of BTC, ETH, and SOL (edgex --json market ticker <symbol>)
2. Get the order book depth for BTC (edgex --json market depth BTC)
3. Get the funding rate for BTC (edgex --json market funding BTC)

Summarize everything in a clean table: asset, price, 24h change%, bid/ask spread, funding rate.
```

#### Technical Briefing

```text
Use edgex-cli to pull the last 50 hourly candles for BTC:
  edgex --json market kline BTC -i 1h -n 50

Then calculate and report:
- Current price vs 24h high/low
- Approximate support/resistance levels from the candle data
- Whether the trend is bullish or bearish based on recent price action
- A 1-paragraph trading outlook
```

#### Portfolio Dashboard

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

#### Multi-Asset Price Monitor

```text
Use edgex-cli to compare these assets:
  BTC, ETH, SOL, TSLA, NVDA, AAPL

For each, run: edgex --json market ticker <symbol>

Then create a comparison table with columns:
Asset | Price | 24h Change | 24h Volume | Open Interest

Sort by 24h change% descending. Add a note about which assets are outperforming.
```

#### Smart Order with Risk Check

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

#### Funding Rate Scanner

```text
Use edgex-cli to scan funding rates:
  edgex --json market funding BTC
  edgex --json market funding ETH
  edgex --json market funding SOL

Also check these stock contracts:
  edgex --json market funding TSLA
  edgex --json market funding NVDA
  edgex --json market funding AAPL

Create a table sorted by absolute funding rate (highest first).
Flag any assets where |funding rate| > 0.01% as potential funding arbitrage opportunities.
Explain briefly how a funding rate trade works.
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
