# EdgeX CLI 项目状态文档

> 最后更新: 2026-03-02 (Mainnet 生产环境测试通过)
> 对话记录: [EdgeX CLI 开发全流程](cb90478e-3a20-4e5a-8bac-a8d6cc9eac7e)

---

## 一、项目概览

- **项目**: EdgeX 永续/美股合约交易 CLI
- **语言**: TypeScript (Node.js, ESM)
- **版本**: 0.1.0
- **路径**: `/Users/naka/Applications/cursorcoding/edgex-cli/`
- **开发计划**: `.cursor/plans/edgex_cli_开发计划_42e3bab4.plan.md`

---

## 二、开发进度

### 已完成的 Phase

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 0 | 项目脚手架 + 6 个公开市场命令 | 完成 |
| Phase 1 | StarkEx ECDSA 签名 + 认证 + 交易命令 | 完成 |
| Phase 2 | WebSocket Manager + stream 命令 | 完成 |
| Phase 3 | npm 发布准备 + CI/CD | 完成 |
| Testnet | testnet 支持 + 认证 bug 修复 | 完成 |
| 产品评审 | 竞品安全对比分析 | 完成 |
| P0 安全加固 | setup 警告 + chmod 600 + 下单确认 | 完成 |
| Mainnet | 生产环境签名修复 + 全链路测试 | 完成 (需入金测试下单) |

### 待做

- [x] **生产环境测试**（2026-03-02 全链路通过，含下单/撤单）
- [x] **P0 安全加固**（见下方"安全改进计划"）
- [x] **l2-signer.ts 签名修复**（与 auth.ts 同步，手动 ECDSA 绕过 @scure/starknet sign() bug）
- [ ] 实际 npm 发布

---

## 三、架构

```
edgex-cli/
  src/
    index.ts              # CLI 入口 (Commander.js) + 全局 --testnet/--json
    core/
      client.ts           # REST API 客户端 (公开 + 认证请求)
      auth.ts             # StarkEx ECDSA 签名 (keccak_256 + stark sign)
      l2-signer.ts        # L2 订单签名 (Pedersen hash chain)
      types.ts            # 所有类型定义
      symbols.ts          # symbol ↔ contractId 解析器 + 缓存
      rate-limiter.ts     # 滑动窗口限流 (50/10s)
      ws.ts               # WebSocket 管理器 (自动重连 + ping/pong)
      config.ts           # 配置管理 (mainnet/testnet 隔离)
    commands/
      setup.ts            # edgex setup (配置向导)
      market.ts           # edgex market (ticker/depth/kline/funding/summary/ratio)
      account.ts          # edgex account (balances/positions/orders/leverage)
      order.ts            # edgex order (create/cancel/cancel-all/status/max-size)
      stream.ts           # edgex stream (ticker/depth/kline/trades/account)
    utils/
      output.ts           # JSON/table/human-readable 输出
      errors.ts           # 统一错误处理
```

---

## 四、关键技术决策

### 签名实现（重要！多次 bug 修复）

- **API 认证签名**: Keccak-256 hash → mod EC_ORDER → 手动 StarkEx ECDSA sign
- **Bug 修复 #1**: `@scure/starknet` 的 `keccak` 函数自动应用 250-bit mask（StarkNet 专用），EdgeX 需要标准 Keccak-256。**修复**: 改用 `@noble/hashes/sha3.js` 的 `keccak_256`
- **Bug 修复 #2 (Mainnet)**: `@scure/starknet` v2.0.0 的 `sign()` 内部 `checkMessage` 限制 hash < 2^251，且 `bits2int_modN` 会截断高位导致 double-reduction。**修复**: 手动实现 StarkEx ECDSA（使用 `Point.BASE.multiply` + 手动 r/s 计算），绕过 `@scure/starknet` 的 sign wrapper
- **Bug 修复 #3 (Mainnet)**: 签名格式需要 r(64hex) + s(64hex) + y(64hex) = 192 chars。y 是公钥的 y 坐标
- **Bug 修复 #4 (l2-signer)**: `l2-signer.ts` 同样使用 `@scure/starknet` 的 `sign()`，存在相同的 `checkMessage` bug。**修复**: 同步改为手动 StarkEx ECDSA（与 auth.ts 一致）
- **L2 订单签名**: 4 步 Pedersen hash chain → 手动 StarkEx ECDSA sign
- **依赖**: `@scure/starknet`（Point, pedersen）+ `@noble/hashes`（keccak_256）

### Testnet 支持

- 全局 `--testnet` 选项，通过 `preAction` hook 设置 `process.env.EDGEX_TESTNET`
- 独立配置文件: `~/.edgex/config-testnet.json`
- 独立合约缓存: `~/.edgex/contracts-testnet.json`
- Testnet URLs: REST `https://testnet.edgex.exchange`, WS `wss://quote-testnet.edgex.exchange`

### 已知 Testnet 限制

- 市价单: testnet 撮合引擎 (`edgex-trade-server-a`) 可能未启动
- 私有 WebSocket: testnet 返回 400，可能未开放

---

## 五、Testnet 测试结果

**凭证**: Account ID `697803560162689322`

| 功能 | 状态 |
|---|---|
| market ticker/depth/kline/funding | 通过 |
| account balances (认证) | 通过 (600 USDC) |
| account positions/orders | 通过 |
| order max-size | 通过 |
| order create (限价) | 通过 (orderId: 722535460462657578) |
| order status/cancel | 通过 |
| order create (市价) | 失败 (testnet 服务端问题) |
| stream ticker (WS) | 通过 |
| stream account (WS) | 失败 (testnet 未开放) |

---

## 5.5、Mainnet 测试结果 (2026-03-02, 第一轮)

**凭证**: Account ID `723165789812687327` (余额 11 USDC)

| 功能 | 状态 |
|---|---|
| market ticker/depth/funding (公开) | ✅ 通过 |
| account balances (认证) | ✅ 通过 (11 USDC) |
| account positions/orders (认证) | ✅ 通过 |
| order max-size (认证) | ✅ 通过 |
| stream ticker (WebSocket) | ✅ 通过 (实时推送正常) |
| order create (限价单) | ✅ 通过 (SOL buy limit 0.3 @$50, orderId: 723200451993928159) |
| order status | ✅ 通过 (OPEN → 确认提示正常) |
| order cancel | ✅ 通过 |
| stream account (私有 WS) | ⏳ 未测试 |

## 5.6、Mainnet 全量测试 (2026-03-02, 第二轮)

**凭证**: Account ID `723165789812687327` (余额 ~111 USDC)
**测试成本**: $0.079 (一次市价买卖往返)
**修复了 2 个 bug**, 发现 2 个显示 bug

### 测试结果

| # | 功能 | 状态 | 备注 |
|---|------|------|------|
| 1 | `market ticker BTC` | ✅ | BTC ~$66,151 |
| 2 | `market ticker SOL` | ✅ | SOL ~$83.64 |
| 3 | `market ticker` (无参数) | ⚠️ | 返回 "No ticker data"，需传 symbol |
| 4 | `market depth BTC` | ✅ | asks/bids 正常 |
| 5 | `market funding BTC` | ✅ | fundingRate 正常 |
| 6 | `market kline BTC -i 1h -n 5` | ✅ | |
| 7 | `market summary` | ✅ | (多数字段为空) |
| 8 | `market ratio BTC` | ✅ | |
| 9 | `account balances` (human) | ⚠️ BUG | **字段名为空**，JSON 模式正常 |
| 10 | `account balances` (json) | ✅ | 111.000198 USDC |
| 11 | `account positions` | ✅ | 无持仓 |
| 12 | `account orders` | ✅ | 无挂单 |
| 13 | `account orders` (human) | ⚠️ BUG | **Order ID 列为空** |
| 14 | `order max-size BTC` | ✅ | 0.016 BTC |
| 15 | `order max-size SOL` | ✅ | 13.1 SOL |
| 16 | `order create SOL buy limit 0.3 @$50 -y` | ✅ | orderId: 723304446922064351 |
| 17 | `order cancel <id>` | ✅ | |
| 18 | `order create SOL sell limit 0.3 @$200 -y` | ✅ | orderId: 723304898174648799 |
| 19 | `order cancel <id>` | ✅ | |
| 20 | 确认提示 `echo 'n'` | ✅ | 显示 Order Preview → "Order cancelled." |
| 21 | `order create SOL buy market 0.3 -y` | ✅ | 修复后通过，orderId: 723305971786449375 |
| 22 | 市价买后 positions | ✅ | SOL long 0.3, openValue $25.113 |
| 23 | `order create SOL sell market 0.3 -y` | ✅ | orderId: 723306088694284767 |
| 24 | 平仓后 positions | ✅ | 空 |
| 25 | 余额变化 | ✅ | 111.000198 → 110.921136 (损耗 $0.079) |
| 26 | cancel-all (2 单) | ✅ | 创建 2 单 → cancel-all → 清空 |
| 27 | `stream ticker BTC` (WS) | ✅ | 实时推送，8s 内收到 5+ 条 |
| 28 | `--json market ticker BTC` | ✅ | 合法 JSON array |
| 29 | `--json market depth BTC` | ✅ | 含 asks/bids |
| 30 | `--json order max-size BTC` | ✅ | |
| 31 | 限价缺 --price | ✅ | `--price is required for limit orders`, exit 1 |
| 32 | 无效 side | ✅ | `Side must be "buy" or "sell"`, exit 1 |
| 33 | 无效 type | ✅ | `Type must be "limit" or "market"`, exit 1 |
| 34 | 未知 symbol | ✅ | `Unknown symbol: ZZZZZ`, exit 1 |
| 35 | `--version` | ✅ | 0.1.0 |
| 36 | `--help` | ✅ | 显示所有命令 |
| 37 | 未知命令 | ✅ | `unknown command 'foobar'`, exit 1 |
| 38 | TSLA 限价买 0.3@$200 → 取消 | ✅ | 美股合约下单正常 |
| 39 | TSLA 限价卖 0.3@$600 → 取消 | ✅ | |
| 40 | TSLA 市价买卖往返 0.3 | ✅ | 开仓 $117.558, 损耗 $0.206 |
| 41 | 限价单 + TP only | ✅ | 修复后通过 |
| 42 | 限价单 + TP + SL 组合 | ✅ | 修复后通过 |
| 43 | 市价单 + TP@$120 + SL@$60 | ✅ | TAKE_PROFIT_MARKET + STOP_MARKET 生成 |
| 44 | TP/SL 状态验证 | ✅ | `UNTRIGGERED`, `isPositionTpsl: true`, `reduceOnly: true` |
| 45 | 平仓后 TP/SL 自动取消 | ✅ | 卖出平仓后 TP/SL 挂单自动清除 |

### 修复的 Bug

**Bug #5 (P0): 市价单 API price 字段应为 '0'**
- 文件: `src/commands/order.ts`
- 原因: 代码将 `oracle * 1.1` (BUY) 或 `oracle * 0.9` (SELL) 作为 API 的 `price` 字段
- API 错误: `INVALID_ORDER_MARKET_PRICE: The market order price must be zero`
- 修复: API body 的 `price` 设为 `'0'`；L2 签名的 l2Price 保持不变（由 l2-signer 内部计算）

**Bug #6 (P0): l2Value 浮点精度超过 API step size**
- 文件: `src/core/l2-signer.ts`
- 原因: `l2Price * size` 产生 JS 浮点数如 `251.29499996546656`（14 位小数）
- API 错误: `INVALID_ORDER_L2_VALUE: matches the step size '0.000001' requirement`
- 修复: `l2Value = parseFloat((l2Price * size).toFixed(6))`

**Bug #7 (P0): TP/SL 子订单缺少 L2 签名**
- 文件: `src/commands/order.ts`
- 原因: `openTp`/`openSl` 只传了 side/price/size/triggerPrice，缺少 L2 签名字段
- API 错误: `GATEWAY_INTERNAL_ERROR: unknown error`
- 修复: 为每个 TP/SL 独立调用 `computeL2OrderFields()` 生成完整的 L2 签名（l2Nonce/l2Value/l2Size/l2LimitFee/l2ExpireTime/l2Signature），同时添加 triggerPrice/triggerPriceType/clientOrderId/expireTime

### 发现的显示 Bug (P1, 未修复)

1. **`account balances` human 模式字段为空**: JSON 返回正常，但 human 模式未正确读取嵌套字段
2. **`account orders` Order ID 列为空**: API 返回的字段名可能与代码读取的不一致

---

## 六、安全改进计划

### 竞品调研结论

调研了 Hyperliquid CLI、Binance CLI、dYdX CLI、CCXT、Hummingbot、Freqtrade、Bitget MCP。

**Bitget MCP 安全模型（值得借鉴）**:
- 完全只读设计 (`readOnly: true`)，36 个工具全是 `get_*`，零写入操作
- `system_get_capabilities` 自检模块可用性
- 每个工具明确标注限流规则

### P0 - 生产环境前必须完成 ✅ (2026-02-28 完成)

1. ✅ **Setup 安全警告**: 配置时显示安全提醒 banner（使用子账户、设提现白名单、明文存储提示）
2. ✅ **配置文件权限**: `~/.edgex/` 目录 chmod 700, config.json chmod 600（Unix only, Windows 跳过）
3. ✅ **下单确认**: 所有下单前显示 Order Preview + 确认提示（`-y/--yes` 跳过），市价单额外⚠警告

### P1 - 后续改进

- 多 Profile 支持 (`--profile`)
- 只读模式 (`--read-only`)
- 敏感信息脱敏 (`setup --show`)
- Dry-run 模式
- 配置加密存储

---

## 七、发布检查清单

```bash
# 构建
cd edgex-cli && npm run clean && npm run build

# 类型检查
npm run typecheck

# 验证 CLI
node dist/index.js --version        # 0.1.0
node dist/index.js --help            # 全部命令
node dist/index.js market ticker BTC # 公开 API
node dist/index.js --testnet market ticker BTC  # testnet

# 认证测试 (需要有效凭证)
node dist/index.js --testnet account balances
node dist/index.js --testnet order create BTC buy limit 0.001 --price 60000
node dist/index.js --testnet order cancel <orderId>

# npm 发布
npm publish --access public
```

---

## 八、文件清单

| 文件 | 说明 |
|---|---|
| `package.json` | 项目配置, prepublishOnly, files, repository |
| `tsconfig.json` | TS 编译配置 (ES2022, Node16, strict) |
| `LICENSE` | MIT |
| `.gitignore` / `.npmignore` | Git/npm 忽略配置 |
| `.github/workflows/ci.yml` | CI: Node 18/20/22 矩阵测试 |
| `.github/workflows/publish.yml` | Release 触发自动 npm 发布 |
| `README.md` | 项目文档 |
| `openclaw/SKILL.md` | AI Agent skill 描述 |

---

## 九、依赖

```json
{
  "@scure/starknet": "^2.0.0",    // StarkEx sign + pedersen
  "@noble/curves": "^2.0.1",      // 间接依赖
  "@noble/hashes": "^2.0.1",      // keccak_256 (标准, 无 mask)
  "chalk": "^5.4.1",              // 终端颜色
  "cli-table3": "^0.6.5",         // 表格输出
  "commander": "^13.1.0",         // CLI 框架
  "enquirer": "^2.4.1",           // 交互式 setup
  "ws": "^8.19.0"                 // WebSocket 客户端
}
```
