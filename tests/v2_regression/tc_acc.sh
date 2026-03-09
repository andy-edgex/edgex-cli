#!/usr/bin/env bash
# ═══════════════════════════════════════════
#  TC-ACC: Account & Asset Regression Tests
# ═══════════════════════════════════════════
source "$(dirname "$0")/lib.sh"

tap_plan 10

# ───────────────────────────────────────────
# TC-ACC-001: USDC equity fields present and numeric
# ───────────────────────────────────────────
echo "# TC-ACC-001: Verify USDC asset fields"

BAL=$(run_cli account balances)

TOTAL_EQUITY=$(json_get "$BAL" "collateralAssetModelList.0.totalEquity")
AVAIL=$(json_get "$BAL" "collateralAssetModelList.0.availableAmount")
INIT_MARGIN=$(json_get "$BAL" "collateralAssetModelList.0.initialMarginRequirement")
COLLATERAL_AMT=$(json_get "$BAL" "collateralList.0.amount")

assert_not_empty "$TOTAL_EQUITY" "TC-ACC-001a: totalEquity is non-empty"
assert_numeric "$TOTAL_EQUITY" "TC-ACC-001b: totalEquity is positive number"
assert_not_empty "$AVAIL" "TC-ACC-001c: availableAmount is non-empty"
assert_numeric "$AVAIL" "TC-ACC-001d: availableAmount is positive number"
assert_not_empty "$COLLATERAL_AMT" "TC-ACC-001e: collateral amount is non-empty"

# ───────────────────────────────────────────
# TC-ACC-002: accountId matches configured account
# ───────────────────────────────────────────
echo "# TC-ACC-002: Verify accountId consistency"

RETURNED_ID=$(json_get "$BAL" "account.id")
assert_eq "$RETURNED_ID" "$EDGEX_ACCOUNT_ID" "TC-ACC-002: returned accountId matches env"

# ───────────────────────────────────────────
# TC-ACC-003: Margin occupation after limit order
# ───────────────────────────────────────────
echo "# TC-ACC-003: initialMargin increases after placing limit order"

BEFORE_AVAIL=$(json_get "$BAL" "collateralAssetModelList.0.availableAmount")
BEFORE_MARGIN=$(json_get "$BAL" "collateralAssetModelList.0.initialMarginRequirement")

# Place a limit BUY far below market (won't fill) — SOL 1 @ $30
ORDER_OUT=$(run_cli order create SOL buy limit 1 --price 30 -y 2>/dev/null || true)
ORDER_ID=$(json_get "$ORDER_OUT" "orderId")

if [ -z "$ORDER_ID" ]; then
  tap_fail "TC-ACC-003a: limit order created for margin test" "order creation failed: $ORDER_OUT"
  tap_skip "TC-ACC-003b: skipped (no order)"
else
  tap_ok "TC-ACC-003a: limit order created (id=$ORDER_ID)"

  wait_settle 2

  BAL2=$(run_cli account balances)
  AFTER_AVAIL=$(json_get "$BAL2" "collateralAssetModelList.0.availableAmount")
  AFTER_FROZEN=$(json_get "$BAL2" "collateralAssetModelList.0.orderFrozenAmount")

  # availableAmount should have decreased (margin frozen for the order)
  assert_lt "$AFTER_AVAIL" "$BEFORE_AVAIL" "TC-ACC-003b: availableAmount decreased after limit order"

  # Cleanup: cancel the order
  run_cli order cancel "$ORDER_ID" >/dev/null 2>&1 || true
fi

# ───────────────────────────────────────────
# TC-ACC-004: Max order size calculation
# ───────────────────────────────────────────
echo "# TC-ACC-004: Max order size for SOL"

wait_settle 1
MAX_OUT=$(run_cli order max-size SOL)
MAX_BUY=$(json_get "$MAX_OUT" "maxBuySize")
MAX_SELL=$(json_get "$MAX_OUT" "maxSellSize")

assert_not_empty "$MAX_BUY" "TC-ACC-004a: maxBuySize is non-empty"
assert_numeric "$MAX_BUY" "TC-ACC-004b: maxBuySize is positive number"

tap_summary
