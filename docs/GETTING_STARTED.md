# EdgeX CLI 使用手册

> 版本 0.1.0 | 支持永续合约 + 美股合约

---

## 一、安装

### 方法 A：npm 全局安装（推荐）

```bash
npm install -g @realnaka/edgex-cli
```

安装后直接使用 `edgex` 命令。

### 方法 B：从源码安装

```bash
git clone https://github.com/realnaka/edgex-cli.git
cd edgex-cli
npm install
npm run build
npm link    # 全局注册 edgex 命令
```

### 验证安装

```bash
edgex --version     # 应输出 0.1.0
edgex --help        # 查看所有命令
```

---

## 二、首次配置 (Setup)

### 第 1 步：获取密钥

1. 打开 [EdgeX 交易所](https://pro.edgex.exchange)
2. 登录你的账户
3. 进入 **Settings / API** 页面
4. 复制你的 **Account ID** 和 **StarkEx Private Key**

> **安全建议**：
> - 使用**子账户**的密钥，不要用主账户
> - 在主账户设置**提现白名单**
> - 密钥以明文存储在 `~/.edgex/config.json`（权限 600，仅本人可读）

### 第 2 步：运行配置向导

```bash
edgex setup
```

按提示输入 Account ID 和 Private Key 即可。

或者一行搞定（适合脚本/CI）：

```bash
edgex setup --account-id 你的AccountID --private-key 0x你的PrivateKey
```

### 第 3 步：验证配置

```bash
edgex account balances
```

如果看到余额信息，说明配置成功。

---

## 三、基本操作

### 3.1 查看行情（无需配置）

```bash
# 查看 BTC 价格
edgex market ticker BTC

# 查看 SOL 深度（盘口）
edgex market depth SOL

# 查看 ETH K 线（1 小时，最近 20 根）
edgex market kline ETH -i 1h -n 20

# 查看 BTC 资金费率
edgex market funding BTC

# 查看多空比
edgex market ratio BTC
```

### 3.2 查看账户

```bash
# 余额
edgex account balances

# 持仓
edgex account positions

# 当前挂单
edgex account orders

# 设置杠杆
edgex account leverage BTC 20
```

### 3.3 下单

#### 限价单

```bash
# 买入 0.01 BTC，限价 $60,000
edgex order create BTC buy limit 0.01 --price 60000
```

系统会显示订单预览并要求确认：

```
Order Preview:

  Symbol:  BTCUSD
  Side:    BUY
  Type:    LIMIT
  Size:    0.01
  Price:   60000

  Confirm order? [y/N]
```

输入 `y` 确认下单。加 `-y` 可跳过确认。

#### 市价单

```bash
# 市价买入 0.3 SOL
edgex order create SOL buy market 0.3
```

> 市价单会显示额外的滑点风险警告。

#### 带止盈止损

```bash
# 限价买入 ETH，止盈 $3500，止损 $2800
edgex order create ETH buy limit 0.1 --price 3000 --tp 3500 --sl 2800

# 市价买入 SOL，止盈 $120，止损 $60
edgex order create SOL buy market 0.3 --tp 120 --sl 60
```

### 3.4 管理订单

```bash
# 查看订单状态
edgex order status 723304446922064351

# 取消单个订单
edgex order cancel 723304446922064351

# 批量取消（逗号分隔）
edgex order cancel 111,222,333

# 取消所有挂单
edgex order cancel-all

# 只取消某个币种的挂单
edgex order cancel-all -s BTC

# 查询最大下单量
edgex order max-size BTC
```

### 3.5 实时推送 (WebSocket)

```bash
# 实时 BTC ticker
edgex stream ticker BTC

# 实时深度
edgex stream depth ETH

# 实时 K 线
edgex stream kline BTC -i 5m

# 实时成交
edgex stream trades SOL

# 账户变动（余额/持仓/订单变更）
edgex stream account
```

按 `Ctrl+C` 停止推送。

---

## 四、进阶用法

### JSON 输出

所有命令都支持 `--json` 输出，方便脚本处理和 AI Agent 集成：

```bash
# 获取 BTC 价格
edgex --json market ticker BTC | jq '.[0].lastPrice'

# 获取账户余额
edgex --json account balances | jq '.collateralList[0].amount'

# 自动下单脚本示例
PRICE=$(edgex --json market ticker BTC | jq -r '.[0].lastPrice')
echo "BTC price: $PRICE"
```

### Testnet 测试

```bash
# 在 testnet 配置密钥
edgex --testnet setup

# testnet 下单
edgex --testnet order create BTC buy limit 0.001 --price 60000 -y
```

Testnet 使用独立的配置文件（`~/.edgex/config-testnet.json`），不影响主网。

### Symbol 简写

你可以灵活输入交易对名称：

| 输入 | 匹配结果 |
|------|----------|
| `BTC` | BTCUSD |
| `btc` | BTCUSD（大小写不敏感）|
| `TSLA` | TSLAUSD |
| `ETH` | ETHUSD |
| `10000001` | BTCUSD（直接用 contractId）|

支持的合约包括加密货币（BTC/ETH/SOL 等）和美股（TSLA/AAPL/NVDA/GOOG/AMZN/META 等）。

---

## 五、常见问题

### Q: 提示 "Run edgex setup"？
A: 你还没配置密钥。运行 `edgex setup` 输入 Account ID 和 Private Key。

### Q: 提示 "Unknown symbol: XXX"？
A: 该交易对不存在。运行 `edgex market ticker` 查看所有可用合约，或删除缓存重试：`rm ~/.edgex/contracts.json`

### Q: 市价单滑点会很大吗？
A: CLI 的市价单实际使用 oracle 价格 ±10% 的限价单提交，保护你免受极端滑点。

### Q: 密钥安全吗？
A: 密钥存储在 `~/.edgex/config.json`，文件权限 600（仅本人可读）。建议使用子账户密钥并设置提现白名单。

### Q: 如何切换 testnet/mainnet？
A: 加 `--testnet` 使用测试网，不加则默认主网。两者配置完全隔离。

### Q: Rate limit 会影响使用吗？
A: CLI 内置了滑动窗口限流（50 请求/10 秒），超出时自动等待，无需手动处理。

---

## 六、速查表

| 操作 | 命令 |
|------|------|
| 看 BTC 价格 | `edgex market ticker BTC` |
| 看盘口 | `edgex market depth SOL` |
| 看余额 | `edgex account balances` |
| 看持仓 | `edgex account positions` |
| 限价买 | `edgex order create BTC buy limit 0.01 --price 60000` |
| 市价卖 | `edgex order create SOL sell market 1` |
| 带止盈止损 | `edgex order create ETH buy limit 1 --price 3000 --tp 3500 --sl 2800` |
| 取消订单 | `edgex order cancel <id>` |
| 取消所有 | `edgex order cancel-all` |
| 实时推送 | `edgex stream ticker BTC` |
| JSON 输出 | 任何命令加 `--json` |
| 测试网 | 任何命令加 `--testnet` |
