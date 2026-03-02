# EdgeX CLI 测试计划

> 生成日期: 2026-03-02
> 项目版本: 0.1.0
> 推荐框架: vitest（ESM 原生支持 + TypeScript）

---

## 测试工具链建议

```bash
npm i -D vitest @vitest/coverage-v8 memfs  # 单元 + 覆盖率 + 文件系统 mock
```

---

## 一、单元测试 (Unit)

### 1.1 签名 — `auth.ts`

| # | 测试名 | 输入 | 期望输出 | 优先级 | 备注 |
|---|--------|------|----------|--------|------|
| U-AUTH-01 | `buildSignContent` GET 无参数 | `(1709000000000, 'GET', '/api/v1/test')` | `'1709000000000GET/api/v1/test'` | P0 | 基线 |
| U-AUTH-02 | `buildSignContent` GET 带参数（排序） | `(ts, 'GET', path, {b:'2', a:'1'})` | `ts + 'GET' + path + 'a=1&b=2'` | P0 | 验证 key 排序 |
| U-AUTH-03 | `buildSignContent` POST 嵌套对象 | `(ts, 'POST', path, {accountId:'123', orderIdList:['a','b']})` | 递归序列化：`accountId=123&orderIdList=a&b` | P0 | `serializeValue` 递归逻辑 |
| U-AUTH-04 | `buildSignContent` POST 空参数 | `(ts, 'POST', path, {})` | `ts + 'POST' + path`（无参数串） | P1 | 边界 |
| U-AUTH-05 | `buildSignContent` boolean/null 值 | `{flag: true, empty: null}` | `empty=&flag=true` | P1 | `serializeValue` 类型覆盖 |
| U-AUTH-06 | `signRequest` 签名格式 192 hex | 任意有效 privKey | signature 长度 = 192, 全 hex | P0 | r(64) + s(64) + y(64) |
| U-AUTH-07 | `signRequest` 签名可验证 | 已知 privKey → 从 pubKey 验证 | ECDSA verify 通过 | P0 | **核心**: 手动 ECDSA 正确性 |
| U-AUTH-08 | `signRequest` privKey 带 0x 前缀 | `'0x0123...'` | 正常签名 | P1 | 前缀处理 |
| U-AUTH-09 | `signRequest` privKey 无 0x 前缀 | `'0123...'` | 正常签名（同上） | P1 | |
| U-AUTH-10 | `starkEcdsaSign` r, s 范围 | 多次签名 | `r < 2^251`, `s != 0`, `r != 0` | P0 | StarkEx 约束 |
| U-AUTH-11 | `starkEcdsaSign` msgHash > 2^251 | 构造大 hash | 不抛异常，签名有效 | P0 | **关键**: 这正是绕过 @scure/starknet 的原因 |
| U-AUTH-12 | `bytesToBigInt` 转换 | `Uint8Array([0x01, 0x00])` | `256n` | P2 | 辅助函数 |

### 1.2 L2 订单签名 — `l2-signer.ts`

| # | 测试名 | 输入 | 期望输出 | 优先级 | 备注 |
|---|--------|------|----------|--------|------|
| U-L2-01 | `computeL2OrderFields` 限价买单 | `{side:'BUY', type:'LIMIT', size:'1', price:'100', accountId:'12345'}` + 合理 meta | 返回完整 L2OrderFields，l2Signature 长度 128 | P0 | |
| U-L2-02 | `computeL2OrderFields` 限价卖单 | 同上但 side='SELL' | BUY/SELL 的 assetIdSell/Buy 方向反转 | P0 | 方向映射 |
| U-L2-03 | 市价买单 l2Price 计算 | `{type:'MARKET', side:'BUY', oraclePrice:'50000'}` | `l2Price = 50000 * 10 = 500000` | P0 | **关键 bug 修复点** |
| U-L2-04 | 市价卖单 l2Price 计算 | `{type:'MARKET', side:'SELL'}`, meta.tickSize='0.01' | `l2Price = 0.01` | P0 | |
| U-L2-05 | 市价单无 oraclePrice | `{type:'MARKET', side:'BUY', oraclePrice: undefined}` | `l2Price = 0`（oracle 默认 '0'） | P1 | 防御性 |
| U-L2-06 | `decimalToBigInt` 正常精度 | `('1.5', 10n**8n)` | `150000000n` | P0 | |
| U-L2-07 | `decimalToBigInt` 无小数部分 | `('100', 10n**8n)` | `10000000000n` | P1 | |
| U-L2-08 | `decimalToBigInt` 高精度输入 | `('0.123456789012345678', 10n**8n)` | 正确截断到 factor 精度 | P1 | |
| U-L2-09 | `ceilDiv` 向上取整 | `(7n, 3n)` | `3n` | P2 | |
| U-L2-10 | `calcNonce` 确定性 | 相同 clientOrderId | 相同 nonce | P1 | SHA-256 前 8 hex |
| U-L2-11 | Pedersen hash chain 方向正确 | BUY vs SELL 相同参数 | hash 不同 | P0 | |
| U-L2-12 | `l2Signature` 可验证 | 已知 privKey | 对 Pedersen hash 结果用公钥 verify | P0 | 手动 ECDSA 正确性 |
| U-L2-13 | 大 size 签名 | `size: '99999.99999999'` | 不溢出，签名有效 | P1 | 大数边界 |
| U-L2-14 | expireTime 范围 | 任意输入 | `expireTime = now + 1d`, `l2ExpireTime = now + 10d` | P1 | |

### 1.3 Symbol 解析 — `symbols.ts`

| # | 测试名 | 输入 | 期望输出 | 优先级 | 备注 |
|---|--------|------|----------|--------|------|
| U-SYM-01 | 精确匹配 | `'BTCUSD'` (contracts 含 BTCUSD) | 返回 BTCUSD 合约 | P0 | |
| U-SYM-02 | 自动补全 USD | `'BTC'` | 返回 BTCUSD | P0 | |
| U-SYM-03 | 自动补全 USDT | `'ETH'` (contracts 含 ETHUSDT) | 返回 ETHUSDT | P1 | |
| U-SYM-04 | 大小写不敏感 | `'btc'` / `'Btc'` | 返回 BTCUSD | P0 | |
| U-SYM-05 | contractId 直接匹配 | `'10001'` | 返回对应合约 | P1 | |
| U-SYM-06 | 前缀匹配 | `'SOL'` (contracts 含 SOLUSD) | 返回 SOLUSD | P1 | |
| U-SYM-07 | 无匹配 | `'XXXYYY'` | 返回 `null` | P0 | |
| U-SYM-08 | 空字符串 | `''` | 返回 `null` 或首个前缀匹配 | P2 | |
| U-SYM-09 | `findCoin` 正常查找 | coinId = '1000' | 返回对应 CoinMeta | P1 | |
| U-SYM-10 | `findCoin` 无匹配 | coinId = '9999' | 返回 `null` | P1 | |

### 1.4 序列化 — `auth.ts: serializeValue`

| # | 测试名 | 输入 | 期望输出 | 优先级 | 备注 |
|---|--------|------|----------|--------|------|
| U-SER-01 | 字符串 | `'hello'` | `'hello'` | P2 | |
| U-SER-02 | 数字 | `42` | `'42'` | P2 | |
| U-SER-03 | boolean | `true` / `false` | `'true'` / `'false'` | P2 | |
| U-SER-04 | null/undefined | `null` | `''` | P2 | |
| U-SER-05 | 数组 | `['a','b','c']` | `'a&b&c'` | P1 | |
| U-SER-06 | 空数组 | `[]` | `''` | P2 | |
| U-SER-07 | 嵌套对象 | `{a: {x:1, y:2}}` | `'a=x=1&y=2'` | P1 | 递归序列化 |
| U-SER-08 | 对象含数组 | `{ids: ['1','2']}` | `'ids=1&2'` | P1 | order cancel 场景 |

### 1.5 Rate Limiter — `rate-limiter.ts`

| # | 测试名 | 输入 | 期望输出 | 优先级 | 备注 |
|---|--------|------|----------|--------|------|
| U-RL-01 | 不超限正常通过 | 连续调用 5 次 | 无等待，立即返回 | P1 | |
| U-RL-02 | 达到 50 次限流 | 快速调用 51 次 | 第 51 次等待 ~10s | P1 | 需 mock `Date.now` |
| U-RL-03 | 窗口滑动释放 | 调用 50 次 → 等 10s → 再调用 | 不限流 | P2 | |

### 1.6 输出格式 — `output.ts`

| # | 测试名 | 输入 | 期望输出 | 优先级 | 备注 |
|---|--------|------|----------|--------|------|
| U-OUT-01 | `formatPnl` 正数 | `'123.45'` | 含 `+123.45` 绿色 | P2 | |
| U-OUT-02 | `formatPnl` 负数 | `'-50.0'` | 含 `-50.0` 红色 | P2 | |
| U-OUT-03 | `formatPnl` NaN | `'abc'` | 原样返回 | P2 | |
| U-OUT-04 | `formatPercent` | `'0.05'` | `'+5.00%'` 绿色 | P2 | |
| U-OUT-05 | `output` json 模式 | `format='json'` | 调用 `printJson` | P2 | |
| U-OUT-06 | `output` human 模式 | `format='human'` | 调用 `humanFn` | P2 | |

### 1.7 错误处理 — `errors.ts`

| # | 测试名 | 输入 | 期望输出 | 优先级 | 备注 |
|---|--------|------|----------|--------|------|
| U-ERR-01 | `handleError` EdgexError | `new ApiError('400', 'bad')` | stderr 含 `[400] bad`，exit(1) | P1 | mock process.exit |
| U-ERR-02 | `handleError` 普通 Error | `new Error('oops')` | stderr 含 `oops` | P2 | |
| U-ERR-03 | `handleError` 非 Error | `'string error'` | stderr 含 `unknown error` | P2 | |

---

## 二、集成测试 (Integration)

> **策略**: 公开 API 可以直接调用 testnet；认证 API 用 mock fetch。

### 2.1 公开 API — `client.ts` (无需凭证)

| # | 测试名 | 输入 | 期望输出 | 优先级 | 备注 |
|---|--------|------|----------|--------|------|
| I-PUB-01 | `getMetaData` 返回合约列表 | 无参数 | `contractList.length > 0`, 含 `contractId`, `contractName` | P0 | 冒烟测试 |
| I-PUB-02 | `getTicker` 全部 | 无参数 | 返回数组，每项含 `lastPrice`, `oraclePrice` | P0 | |
| I-PUB-03 | `getTicker` 指定合约 | contractId of BTC | 返回 1 项 | P1 | |
| I-PUB-04 | `getDepth` | contractId, level='5' | 返回 `asks` + `bids` 数组 | P1 | |
| I-PUB-05 | `getKline` | contractId, '1MIN' | 返回 K 线数组 | P2 | |
| I-PUB-06 | `getLatestFundingRate` | 无参数 | 返回数组，含 `fundingRate` | P1 | |
| I-PUB-07 | `getServerTime` | 无参数 | `serverTime` 是数字字符串 | P2 | |
| I-PUB-08 | 无效 contractId | `'999999'` | 返回空或 API 错误 | P1 | |

### 2.2 认证 API — `client.ts` (mock fetch)

| # | 测试名 | 输入 | 期望输出 | 优先级 | 备注 |
|---|--------|------|----------|--------|------|
| I-AUTH-01 | `getAccountAsset` 请求头 | mock fetch | 含 `X-edgeX-Api-Timestamp` + `X-edgeX-Api-Signature` | P0 | 验证签名附加 |
| I-AUTH-02 | `getAccountAsset` 签名长度 | 捕获 headers | signature 192 hex chars | P0 | |
| I-AUTH-03 | `createOrder` POST body | mock fetch | body 含完整订单字段 + accountId | P0 | |
| I-AUTH-04 | `cancelOrderById` 多 ID | `['id1','id2']` | body.orderIdList = ['id1','id2'] | P1 | |
| I-AUTH-05 | 无凭证调用 authRequest | accountId = undefined | 抛 ConfigError | P0 | `requireAuth()` |
| I-AUTH-06 | API 返回 code 非 '0' | mock `{code:'1001', msg:'bad'}` | 抛 ApiError(1001) | P1 | |
| I-AUTH-07 | HTTP 500 | mock 500 响应 | 抛 ApiError('500') | P1 | |
| I-AUTH-08 | 网络不通 | mock fetch throw | 抛 ApiError('NETWORK', ...) | P1 | |
| I-AUTH-09 | GET 认证请求参数排序 | `{z:'1', a:'2'}` | URL query 按字母序：`a=2&z=1` | P1 | |

### 2.3 WebSocket — `ws.ts`

| # | 测试名 | 输入 | 期望输出 | 优先级 | 备注 |
|---|--------|------|----------|--------|------|
| I-WS-01 | 连接成功 + 订阅 | mock WS 服务器 | 收到 subscribe 消息 | P1 | 需要 mock ws server |
| I-WS-02 | 收到 ping → 回 pong | 服务端发 `{type:'ping', time:'...'}` | 客户端回 `{type:'pong', time:'...'}` | P1 | |
| I-WS-03 | 收到 quote-event | `{type:'quote-event', channel:'...', content:{data:{...}}}` | `onMessage` 被调用，传入正确 data | P1 | |
| I-WS-04 | 断线重连 | 关闭连接 | 3s 后重连，最多 10 次 | P1 | |
| I-WS-05 | 超过最大重连 | 连续断开 11 次 | 调用 `onClose` | P2 | |
| I-WS-06 | 手动 close 不重连 | 调用 `ws.close()` | 不触发重连 | P2 | |
| I-WS-07 | 错误消息处理 | `{type:'error', content:{msg:'bad'}}` | 写入 stderr | P2 | |

---

## 三、CLI E2E 测试

> **策略**: 用 `child_process.execFile` 执行 `node dist/index.js`，捕获 stdout/stderr/exitCode。

### 3.1 全局选项

| # | 测试名 | 命令 | 期望 | 优先级 | 备注 |
|---|--------|------|------|--------|------|
| E-GLO-01 | `--version` | `edgex --version` | stdout 含 `0.1.0`, exit 0 | P0 | |
| E-GLO-02 | `--help` | `edgex --help` | stdout 含 `setup`, `market`, `account`, `order`, `stream` | P0 | |
| E-GLO-03 | `--json` 传递 | `edgex --json market ticker BTC` | stdout 是合法 JSON | P0 | |
| E-GLO-04 | `--testnet` 生效 | `edgex --testnet market ticker BTC` | stderr 含 `[TESTNET]` | P0 | |
| E-GLO-05 | 未知命令 | `edgex foobar` | stderr 含 error, exit 非 0 | P1 | |

### 3.2 Market 命令（公开，无需凭证）

| # | 测试名 | 命令 | 期望 | 优先级 | 备注 |
|---|--------|------|------|--------|------|
| E-MKT-01 | `market ticker` | `edgex market ticker` | 输出 ticker 表格 | P0 | |
| E-MKT-02 | `market ticker BTC` | `edgex market ticker BTC` | 输出含 BTC 行 | P0 | |
| E-MKT-03 | `market ticker --json` | `edgex --json market ticker BTC` | 合法 JSON 数组 | P1 | |
| E-MKT-04 | `market depth BTC` | `edgex market depth BTC` | 输出 asks/bids | P1 | |
| E-MKT-05 | `market funding` | `edgex market funding` | 输出 funding rate 表 | P1 | |
| E-MKT-06 | `market kline BTC 1H` | `edgex market kline BTC 1H` | 输出 K 线数据 | P2 | |
| E-MKT-07 | 无效 symbol | `edgex market depth ZZZZZ` | stderr 含 error, exit 1 | P1 | |

### 3.3 Account 命令（需凭证）

| # | 测试名 | 命令 | 期望 | 优先级 | 备注 |
|---|--------|------|------|--------|------|
| E-ACC-01 | 无凭证报错 | `edgex account balances` (无 config) | stderr 含 `Run "edgex setup"`, exit 1 | P0 | |
| E-ACC-02 | `account balances` | 有效凭证 | 输出余额信息 | P0 | testnet 可测 |
| E-ACC-03 | `account positions` | 有效凭证 | 输出持仓（可为空） | P1 | |
| E-ACC-04 | `account orders` | 有效凭证 | 输出挂单列表 | P1 | |
| E-ACC-05 | `account balances --json` | 有效凭证 | 合法 JSON | P1 | |

### 3.4 Order 命令（需凭证，高优先级）

| # | 测试名 | 命令 | 期望 | 优先级 | 备注 |
|---|--------|------|------|--------|------|
| E-ORD-01 | 限价单缺 price | `edgex order create BTC buy limit 1` | stderr 含 `--price is required`, exit 1 | P0 | |
| E-ORD-02 | 无效 side | `edgex order create BTC up limit 1 --price 100` | stderr 含 `buy or sell`, exit 1 | P0 | |
| E-ORD-03 | 无效 type | `edgex order create BTC buy foo 1` | stderr 含 `limit or market`, exit 1 | P0 | |
| E-ORD-04 | 确认提示（取消） | `echo 'n' \| edgex order create ...` | stderr 含 `cancelled`, 不发送请求 | P0 | |
| E-ORD-05 | `-y` 跳过确认 | `edgex order create BTC buy limit 0.001 --price 1 -y` | 直接下单（mock API 验证） | P0 | |
| E-ORD-06 | 市价单有 MARKET 警告 | `echo 'n' \| edgex order create BTC buy market 1` | stderr 含 `Market orders execute` | P1 | |
| E-ORD-07 | `order status` | `edgex order status <validId>` | 输出订单详情 | P1 | |
| E-ORD-08 | `order cancel` | `edgex order cancel <validId>` | 输出 `Cancelled` | P1 | |
| E-ORD-09 | `order cancel` 多 ID | `edgex order cancel id1,id2,id3` | 批量取消 3 个 | P2 | |
| E-ORD-10 | `order cancel-all` | `edgex order cancel-all` | 输出 `All orders cancelled` | P2 | |
| E-ORD-11 | `order max-size BTC` | `edgex order max-size BTC` | 输出 maxBuySize/maxSellSize | P1 | |
| E-ORD-12 | 未知 symbol 下单 | `edgex order create ZZZZZ buy limit 1 --price 1 -y` | stderr 含 `Unknown symbol`, exit 1 | P1 | |

### 3.5 Stream 命令

| # | 测试名 | 命令 | 期望 | 优先级 | 备注 |
|---|--------|------|------|--------|------|
| E-STR-01 | `stream ticker BTC` | 执行后 5s Ctrl+C | 先输出 `Connected`, 再输出 ticker 数据 | P1 | 需超时 kill |
| E-STR-02 | 无效 symbol | `edgex stream ticker ZZZZZ` | 错误处理 | P2 | |

### 3.6 Setup 命令

| # | 测试名 | 命令 | 期望 | 优先级 | 备注 |
|---|--------|------|------|--------|------|
| E-SET-01 | `setup` 交互 | 模拟输入 accountId + key | 写入 `~/.edgex/config.json` | P1 | 需 mock stdin |
| E-SET-02 | `setup --testnet` | 模拟输入 | 写入 `~/.edgex/config-testnet.json` | P1 | |

---

## 四、配置隔离测试

| # | 测试名 | 输入 | 期望输出 | 优先级 | 备注 |
|---|--------|------|----------|--------|------|
| C-ISO-01 | mainnet 配置路径 | `EDGEX_TESTNET` 未设置 | `~/.edgex/config.json` | P0 | |
| C-ISO-02 | testnet 配置路径 | `EDGEX_TESTNET='1'` | `~/.edgex/config-testnet.json` | P0 | |
| C-ISO-03 | 合约缓存隔离 | mainnet vs testnet | 不同文件 `contracts.json` vs `contracts-testnet.json` | P0 | |
| C-ISO-04 | 环境变量优先级 | config 文件有值 + env 也有值 | env 覆盖 file | P0 | `loadConfig` 的 spread 顺序 |
| C-ISO-05 | `isTestnet` 判断 | `'1'`, `'true'`, `undefined` | `true`, `true`, `false` | P1 | |
| C-ISO-06 | 配置目录 chmod 700 | `ensureConfigDir()` (Unix) | 目录权限 0o700 | P0 | |
| C-ISO-07 | 配置文件 chmod 600 | `saveConfig()` (Unix) | 文件权限 0o600 | P0 | **安全加固** |
| C-ISO-08 | Windows 跳过 chmod | `platform() === 'win32'` | 不调用 chmod | P2 | |
| C-ISO-09 | 缓存过期（1h） | 缓存 timestamp 在 2h 前 | 返回 `null`，触发重新获取 | P1 | |
| C-ISO-10 | 缓存未过期 | 缓存 timestamp 在 30m 前 | 返回缓存数据 | P1 | |
| C-ISO-11 | 缓存文件损坏 | 写入非 JSON | 返回 `null`，不崩溃 | P1 | |

---

## 五、边界 Case 与回归测试

### 5.1 市价单 Price 计算（回归：price: '0' bug）

| # | 测试名 | 输入 | 期望输出 | 优先级 | 备注 |
|---|--------|------|----------|--------|------|
| B-MKT-01 | 市价买单 price = oracle * 1.1 | oracle = 50000 | orderPrice = ceil(55000 * 100) / 100 = '55000' | P0 | **回归** |
| B-MKT-02 | 市价卖单 price = oracle * 0.9 | oracle = 50000 | orderPrice = floor(45000 * 100) / 100 = '45000' | P0 | **回归** |
| B-MKT-03 | oracle 精度小数 | oracle = '137.456' | BUY: ceil(151.2016 * 100)/100 = '151.21' | P1 | 四舍五入 |
| B-MKT-04 | oracle = 0 | 无 ticker 数据 | orderPrice = '0'? 需明确行为 | P0 | **潜在 bug** |
| B-MKT-05 | L2 市价买单 l2Price | oracle = 50000 | l2Price = 500000 (10x oracle) | P0 | |
| B-MKT-06 | L2 市价卖单 l2Price | tickSize = '0.01' | l2Price = 0.01 | P0 | |
| B-MKT-07 | timeInForce 正确 | 市价单 | `IMMEDIATE_OR_CANCEL` | P1 | |
| B-MKT-08 | timeInForce 正确 | 限价单 | `GOOD_TIL_CANCEL` | P1 | |

### 5.2 大数与精度

| # | 测试名 | 输入 | 期望输出 | 优先级 | 备注 |
|---|--------|------|----------|--------|------|
| B-BIG-01 | BTC 全额 size | size='100', price='100000' | l2Value 正确，不溢出 | P1 | |
| B-BIG-02 | 极小 size | size='0.001' | amountSynthetic 正确缩放 | P1 | |
| B-BIG-03 | price 高精度 | price='0.00001234' | decimalToBigInt 正确 | P1 | |
| B-BIG-04 | accountId 大数 | `'723165789812687327'` | positionId = BigInt 正确 | P1 | 真实 ID |
| B-BIG-05 | starkExResolution 极大 hex | `'0x1000000000000000000'` | hexToInt 正确转换 | P1 | |

### 5.3 无效输入防御

| # | 测试名 | 输入 | 期望输出 | 优先级 | 备注 |
|---|--------|------|----------|--------|------|
| B-INV-01 | size 非数字 | `'abc'` | NaN 处理或抛错 | P1 | |
| B-INV-02 | price 负数 | `'-100'` | 明确行为（拒绝或传递） | P1 | |
| B-INV-03 | size 负数 | `'-1'` | 明确行为 | P1 | |
| B-INV-04 | price = 0 限价单 | `'0'` | 明确行为 | P1 | |
| B-INV-05 | starkPrivateKey 空 | `''` | BigInt('0x') 抛错 → 需处理 | P0 | |
| B-INV-06 | starkPrivateKey 非 hex | `'not-hex'` | 抛错 → 需友好提示 | P0 | |
| B-INV-07 | 缺少 StarkEx metadata | contract 缺 starkExSyntheticAssetId | 抛 EdgexError + 提示清缓存 | P1 | `getL2Meta` |
| B-INV-08 | 缺少 quoteCoin metadata | coin 缺 starkExAssetId | 抛 EdgexError | P1 | |

---

## 六、测试优先级总结

| 优先级 | 数量 | 覆盖范围 |
|--------|------|----------|
| **P0** | ~30 | 签名正确性、市价单价格、配置隔离、核心 CLI 流程 |
| **P1** | ~40 | API 集成、边界精度、错误处理、WebSocket |
| **P2** | ~20 | 辅助函数、格式化、极端边界 |

---

## 七、推荐实施顺序

```
Phase 1 (Day 1-2): P0 单元测试
  → auth.ts 签名验证 (U-AUTH-06/07/10/11)
  → l2-signer.ts 市价单计算 (U-L2-03/04)
  → symbols.ts 解析 (U-SYM-01/02/04/07)
  → config.ts 隔离 (C-ISO-01~07)

Phase 2 (Day 3): P0 E2E + 回归
  → CLI 全局选项 (E-GLO-01~04)
  → 下单输入验证 (E-ORD-01~06)
  → 市价单 price 回归 (B-MKT-01~06)

Phase 3 (Day 4): P1 集成测试
  → 公开 API 冒烟 (I-PUB-01~06)
  → mock fetch 认证测试 (I-AUTH-01~09)
  → WebSocket (I-WS-01~04)

Phase 4 (Day 5): P1/P2 补全
  → 大数边界 (B-BIG-*)
  → 无效输入防御 (B-INV-*)
  → 输出格式 + 辅助函数
```

---

## 八、测试文件结构建议

```
edgex-cli/
  tests/
    unit/
      auth.test.ts            # U-AUTH-*, U-SER-*
      l2-signer.test.ts       # U-L2-*
      symbols.test.ts         # U-SYM-*
      config.test.ts          # C-ISO-*
      rate-limiter.test.ts    # U-RL-*
      output.test.ts          # U-OUT-*
      errors.test.ts          # U-ERR-*
    integration/
      client-public.test.ts   # I-PUB-* (真实 testnet)
      client-auth.test.ts     # I-AUTH-* (mock fetch)
      ws.test.ts              # I-WS-* (mock WS server)
    e2e/
      cli-global.test.ts      # E-GLO-*
      cli-market.test.ts      # E-MKT-*
      cli-account.test.ts     # E-ACC-*
      cli-order.test.ts       # E-ORD-*
      cli-stream.test.ts      # E-STR-*
      cli-setup.test.ts       # E-SET-*
    regression/
      market-order-price.test.ts  # B-MKT-*
      bignum.test.ts              # B-BIG-*
      invalid-input.test.ts       # B-INV-*
    fixtures/
      contracts.json          # mock 合约数据
      coins.json              # mock coin 数据
    helpers/
      exec-cli.ts             # child_process 封装
      mock-server.ts          # mock HTTP/WS 服务器
  vitest.config.ts
```

---

## 九、关键 Mock 策略

| 被 mock 对象 | 方法 | 用途 |
|---|---|---|
| `globalThis.fetch` | `vi.fn()` 返回自定义 Response | 认证 API 测试，无需真实网络 |
| `Date.now` | `vi.spyOn` 固定时间 | 签名 timestamp、缓存过期、rate limiter |
| `randomBytes` | `vi.mock('node:crypto')` | 签名确定性测试 |
| `process.exit` | `vi.spyOn` | 验证 `handleError` 退出码 |
| `process.env` | 直接赋值 + afterEach 清理 | testnet 切换 |
| `fs` 模块 | `memfs` 或 `vi.mock` | 配置文件读写 + chmod 权限 |
| WebSocket | `ws` 模块创建本地 server | WS 连接/重连测试 |
| `stdin` | `Readable.from(['n\n'])` | 确认提示测试 |

---

## 十、CI 集成建议

```yaml
# .github/workflows/ci.yml 追加
- name: Test
  run: npx vitest run --coverage
  env:
    EDGEX_TESTNET: '1'  # 集成测试用 testnet

- name: Coverage check
  run: npx vitest run --coverage --coverage.thresholds.lines=80
```

> **注意**: 集成测试 (I-PUB-*) 需要网络访问 testnet，可标记 `describe.skipIf(!process.env.CI)` 在本地跳过。
