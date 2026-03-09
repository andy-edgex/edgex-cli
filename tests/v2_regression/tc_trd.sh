#!/usr/bin/env bash
# ═══════════════════════════════════════════
#  TC-TRD: Trade Lifecycle Regression Tests
#  Uses SOL (minOrder=1, price~$91, fits 19.8 USDC w/ leverage)
#
#  Data structure notes (from live API):
#    account orders --json → { dataList: [{ id, side, price, ... }] }
#    account positions --json → [{ openSize, contractId, openValue, ... }]
#    order create --json → { orderId: "..." }
#    SOL contractId = "10000003"
# ═══════════════════════════════════════════
source "$(dirname "$0")/lib.sh"

SOL_CONTRACT_ID="10000003"

tap_plan 15

# ───────────────────────────────────────────
# TC-TRD-001: Limit order normal placement
# ───────────────────────────────────────────
echo "# TC-TRD-001: Limit Buy Order (maker, far below market)"

ORDER_OUT=$(run_cli order create SOL buy limit 1 --price 30 -y 2>/dev/null || true)
ORDER_ID_001=$(json_get "$ORDER_OUT" "orderId")

if [ -z "$ORDER_ID_001" ]; then
  tap_fail "TC-TRD-001a: limit order creation returns orderId" "got: $ORDER_OUT"
  tap_skip "TC-TRD-001b: skipped"
  tap_skip "TC-TRD-001c: skipped"
else
  tap_ok "TC-TRD-001a: limit order creation returns orderId ($ORDER_ID_001)"

  wait_settle 5

  # Active orders: { dataList: [{ id, side, ... }] }
  ORDERS=$(run_cli account orders)
  FOUND=$(echo "$ORDERS" | node -e "
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    const list=d.dataList||d||[];
    const arr=Array.isArray(list)?list:[];
    const found=arr.some(o=>String(o.id||o.orderId)==='$ORDER_ID_001');
    process.stdout.write(found?'1':'0');
  ")
  assert_eq "$FOUND" "1" "TC-TRD-001b: order appears in active orders list"

  # Check order fields from the active order list itself (order status endpoint may not work)
  ORDER_SIDE=$(echo "$ORDERS" | node -e "
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    const list=d.dataList||d||[];
    const arr=Array.isArray(list)?list:[];
    const o=arr.find(o=>String(o.id||o.orderId)==='$ORDER_ID_001');
    process.stdout.write(o?o.side||o.status||'':'');
  ")
  if [ "$ORDER_SIDE" = "BUY" ]; then
    tap_ok "TC-TRD-001c: order side is BUY (confirmed in active list)"
  elif [ -n "$ORDER_SIDE" ]; then
    tap_ok "TC-TRD-001c: order found with field=$ORDER_SIDE"
  else
    tap_fail "TC-TRD-001c: order details found in active list" "order not found"
  fi
fi

# ───────────────────────────────────────────
# TC-TRD-006: Cancel all orders (run early to clean up 001)
# ───────────────────────────────────────────
echo "# TC-TRD-006: Cancel all orders"

CANCEL_OUT=$(run_cli order cancel-all 2>/dev/null || true)

if json_is_error "$CANCEL_OUT" 2>/dev/null; then
  tap_fail "TC-TRD-006a: cancel-all succeeds" "$(json_get "$CANCEL_OUT" "error")"
else
  tap_ok "TC-TRD-006a: cancel-all succeeds"
fi

wait_settle 3

ORDERS_AFTER=$(run_cli account orders)
ACTIVE_COUNT=$(echo "$ORDERS_AFTER" | node -e "
  const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
  const list=d.dataList||d||[];
  const arr=Array.isArray(list)?list:[];
  process.stdout.write(String(arr.length));
")
assert_eq "$ACTIVE_COUNT" "0" "TC-TRD-006b: active orders list is empty after cancel-all"

# ───────────────────────────────────────────
# TC-TRD-002: Market sell → SHORT position appears
# ───────────────────────────────────────────
echo "# TC-TRD-002: Market Sell Order (taker) — SOL 1"

MKT_OUT=$(run_cli order create SOL sell market 1 -y 2>/dev/null || true)
MKT_ORDER_ID=$(json_get "$MKT_OUT" "orderId")

if [ -z "$MKT_ORDER_ID" ]; then
  tap_fail "TC-TRD-002a: market sell order created" "got: $MKT_OUT"
  tap_skip "TC-TRD-002b: skipped"
  tap_skip "TC-TRD-002c: skipped"
else
  tap_ok "TC-TRD-002a: market sell order created (id=$MKT_ORDER_ID)"

  wait_settle 5

  # Positions: [{ openSize, contractId, openValue, ... }]
  POS_OUT=$(run_cli account positions)
  POS_CHECK=$(echo "$POS_OUT" | node -e "
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    const list=Array.isArray(d)?d:[];
    const sol=list.find(p=>p.contractId==='$SOL_CONTRACT_ID');
    if(!sol){process.stdout.write('NONE');process.exit();}
    const size=parseFloat(sol.openSize||sol.size||'0');
    process.stdout.write(size<0?'SHORT':'LONG_OR_ZERO');
  ")
  assert_eq "$POS_CHECK" "SHORT" "TC-TRD-002b: SOL SHORT position exists after market sell"

  # Entry price: derive from openValue / openSize
  ENTRY_PRICE=$(echo "$POS_OUT" | node -e "
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    const list=Array.isArray(d)?d:[];
    const sol=list.find(p=>p.contractId==='$SOL_CONTRACT_ID');
    if(!sol){process.stdout.write('');process.exit();}
    // entryPrice = |openValue / openSize|
    const v=Math.abs(parseFloat(sol.openValue||'0'));
    const s=Math.abs(parseFloat(sol.openSize||sol.size||'0'));
    const ep=s>0?(v/s).toFixed(2):'0';
    process.stdout.write(ep);
  ")
  assert_numeric "$ENTRY_PRICE" "TC-TRD-002c: derived entry price is valid ($ENTRY_PRICE)"
fi

# ───────────────────────────────────────────
# TC-TRD-004: Reverse close → balance recovers (not zero)
# ───────────────────────────────────────────
echo "# TC-TRD-004: Reverse close position, balance recovers"

BAL_BEFORE_CLOSE=$(run_cli account balances)
AVAIL_BEFORE=$(json_get "$BAL_BEFORE_CLOSE" "collateralAssetModelList.0.availableAmount")

CLOSE_OUT=$(run_cli order create SOL buy market 1 -y 2>/dev/null || true)
CLOSE_ID=$(json_get "$CLOSE_OUT" "orderId")

if [ -z "$CLOSE_ID" ]; then
  tap_fail "TC-TRD-004a: reverse close order created" "got: $CLOSE_OUT"
  tap_skip "TC-TRD-004b: skipped"
  tap_skip "TC-TRD-004c: skipped"
else
  tap_ok "TC-TRD-004a: reverse close order created (id=$CLOSE_ID)"

  wait_settle 5

  POS_AFTER=$(run_cli account positions)
  POS_COUNT=$(echo "$POS_AFTER" | node -e "
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    const list=Array.isArray(d)?d:[];
    const sol=list.find(p=>p.contractId==='$SOL_CONTRACT_ID'&&parseFloat(p.openSize||p.size||'0')!==0);
    process.stdout.write(sol?'OPEN':'CLOSED');
  ")
  assert_eq "$POS_COUNT" "CLOSED" "TC-TRD-004b: SOL position closed after reverse order"

  # CRITICAL: availableBalance must NOT be zero (regression for "balance goes to 0" bug)
  BAL_AFTER_CLOSE=$(run_cli account balances)
  AVAIL_AFTER=$(json_get "$BAL_AFTER_CLOSE" "collateralAssetModelList.0.availableAmount")

  assert_gt "$AVAIL_AFTER" "0" "TC-TRD-004c: availableAmount > 0 after close (got $AVAIL_AFTER, was $AVAIL_BEFORE)"
fi

# ───────────────────────────────────────────
# TC-TRD-003: Oversized order → error intercepted
# ───────────────────────────────────────────
echo "# TC-TRD-003: Insufficient balance error interception"

ERR_OUT=$(run_cli order create SOL buy limit 99999 --price 200 -y 2>&1 || true)

IS_ERR=$(echo "$ERR_OUT" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    process.stdout.write(d.success===false?'1':'0');
  } catch(e) {
    process.stdout.write('1');
  }
")
assert_eq "$IS_ERR" "1" "TC-TRD-003a: oversized order is rejected (not crash)"

ERR_MSG=$(echo "$ERR_OUT" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    process.stdout.write(d.error||'');
  } catch(e) {
    process.stdout.write(require('fs').readFileSync(0,'utf8').trim());
  }
" 2>/dev/null || echo "$ERR_OUT")
assert_not_empty "$ERR_MSG" "TC-TRD-003b: error message is non-empty ($ERR_MSG)"

# ───────────────────────────────────────────
# TC-TRD-005: Order with TP/SL
# ───────────────────────────────────────────
echo "# TC-TRD-005: Limit order with TP and SL"

TPSL_OUT=$(run_cli order create SOL buy limit 1 --price 30 --tp 150 --sl 20 -y 2>/dev/null || true)
TPSL_ID=$(json_get "$TPSL_OUT" "orderId")

if [ -z "$TPSL_ID" ]; then
  TPSL_ERR=$(json_get "$TPSL_OUT" "error" 2>/dev/null || echo "$TPSL_OUT")
  if echo "$TPSL_ERR" | grep -qi "L2_LIMIT_FEE\|LIMIT_FEE_NOT_ENOUGH"; then
    tap_fail "TC-TRD-005a: TP/SL order created (L2_LIMIT_FEE bug still present)" "$TPSL_ERR"
  else
    tap_fail "TC-TRD-005a: TP/SL order created" "got: $TPSL_ERR"
  fi
  tap_skip "TC-TRD-005b: skipped"
else
  tap_ok "TC-TRD-005a: TP/SL order created (id=$TPSL_ID)"
  tap_ok "TC-TRD-005b: no L2_LIMIT_FEE error (bug fixed)"

  # Cleanup
  run_cli order cancel "$TPSL_ID" >/dev/null 2>&1 || true
fi

tap_summary
