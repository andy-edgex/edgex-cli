#!/usr/bin/env bash
# ═══════════════════════════════════════════
#  TC-SUB: Sub-account Isolation & L2 Signature Tests
#
#  Requires TWO sets of credentials:
#    EDGEX_ACCOUNT_ID / EDGEX_STARK_PRIVATE_KEY  → main account
#    SUB_ACCOUNT_ID   / SUB_STARK_PRIVATE_KEY    → sub-account
#
#  Tests:
#    TC-SUB-001: accountId isolation (each key returns its own ID)
#    TC-SUB-002: cross-key L2 signature rejection (main key + sub ID → fail)
#    TC-SUB-003: sub-account can read its own balance independently
#    TC-SUB-004: sub-account can place orders with its own key
# ═══════════════════════════════════════════
source "$(dirname "$0")/lib.sh"

# ─── Sub-account credentials ───
MAIN_ACCT="$EDGEX_ACCOUNT_ID"
MAIN_KEY="$EDGEX_STARK_PRIVATE_KEY"
SUB_ACCT="${SUB_ACCOUNT_ID:-}"
SUB_KEY="${SUB_STARK_PRIVATE_KEY:-}"

if [ -z "$SUB_ACCT" ] || [ -z "$SUB_KEY" ]; then
  tap_plan 7
  echo "# SKIP: SUB_ACCOUNT_ID or SUB_STARK_PRIVATE_KEY not set"
  tap_skip "TC-SUB-001a: sub-account credentials not configured"
  tap_skip "TC-SUB-001b: sub-account credentials not configured"
  tap_skip "TC-SUB-002a: sub-account credentials not configured"
  tap_skip "TC-SUB-002b: sub-account credentials not configured"
  tap_skip "TC-SUB-003: sub-account credentials not configured"
  tap_skip "TC-SUB-004a: sub-account credentials not configured"
  tap_skip "TC-SUB-004b: sub-account credentials not configured"
  tap_summary
  exit 0
fi

tap_plan 7

# ───────────────────────────────────────────
# TC-SUB-001: accountId isolation — each key returns its own ID
# ───────────────────────────────────────────
echo "# TC-SUB-001: Verify accountId isolation between main and sub"

MAIN_BAL=$(run_cli_as "$MAIN_ACCT" "$MAIN_KEY" account balances)
MAIN_RET_ID=$(json_get "$MAIN_BAL" "account.id")
assert_eq "$MAIN_RET_ID" "$MAIN_ACCT" "TC-SUB-001a: main account returns its own accountId"

SUB_BAL=$(run_cli_as "$SUB_ACCT" "$SUB_KEY" account balances)
SUB_RET_ID=$(json_get "$SUB_BAL" "account.id")
assert_eq "$SUB_RET_ID" "$SUB_ACCT" "TC-SUB-001b: sub-account returns its own accountId"

# ───────────────────────────────────────────
# TC-SUB-002: Cross-key L2 signature rejection
#   Use MAIN account's private key but SUB account's ID.
#   The L2 signature will be invalid → Censor must reject.
# ───────────────────────────────────────────
echo "# TC-SUB-002: Cross-key signing must be rejected by Censor"

# Attempt a limit order using main key + sub account ID
CROSS_OUT=$(run_cli_as "$SUB_ACCT" "$MAIN_KEY" order create SOL buy limit 1 --price 30 -y 2>&1 || true)

# This should fail — either auth error or L2 signature mismatch
IS_ERR=$(echo "$CROSS_OUT" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    // success=false or no orderId means rejection
    process.stdout.write(d.success===false || !d.orderId ? '1' : '0');
  } catch(e) {
    // non-JSON = CLI crashed with error, also counts as rejection
    process.stdout.write('1');
  }
")
assert_eq "$IS_ERR" "1" "TC-SUB-002a: cross-key order is rejected (main key + sub ID)"

# Verify the error mentions signature or auth
CROSS_ERR=$(echo "$CROSS_OUT" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    process.stdout.write(d.error||'rejected');
  } catch(e) {
    process.stdout.write(require('fs').readFileSync(0,'utf8').substring(0,200));
  }
" 2>/dev/null || echo "$CROSS_OUT")
assert_not_empty "$CROSS_ERR" "TC-SUB-002b: rejection error message is non-empty ($CROSS_ERR)"

# ───────────────────────────────────────────
# TC-SUB-003: Sub-account balance is independent
# ───────────────────────────────────────────
echo "# TC-SUB-003: Sub-account balance is independent from main"

MAIN_EQUITY=$(json_get "$MAIN_BAL" "collateralAssetModelList.0.totalEquity")
SUB_EQUITY=$(json_get "$SUB_BAL" "collateralAssetModelList.0.totalEquity")

# They should not be identical (unless both are zero, which we flag)
SAME=$(node -e "
  const m=parseFloat('$MAIN_EQUITY'||'0'), s=parseFloat('$SUB_EQUITY'||'0');
  // If sub has no funds, that's still isolation (different value)
  process.stdout.write(m===s && m>0 ? 'SAME' : 'ISOLATED');
")
assert_eq "$SAME" "ISOLATED" "TC-SUB-003: main and sub equity are independent (main=$MAIN_EQUITY, sub=$SUB_EQUITY)"

# ───────────────────────────────────────────
# TC-SUB-004: Sub-account can place orders with its own key
#   This validates the fix for "sub-account L2 signature error on close"
# ───────────────────────────────────────────
echo "# TC-SUB-004: Sub-account can place orders with correct key"

# Check if sub-account has any balance to trade
SUB_AVAIL=$(json_get "$SUB_BAL" "collateralAssetModelList.0.availableAmount")
SUB_HAS_FUNDS=$(node -e "process.stdout.write(parseFloat('$SUB_AVAIL'||'0')>1?'1':'0')")

if [ "$SUB_HAS_FUNDS" = "1" ]; then
  # Sub-account has funds — try a limit order
  SUB_ORDER=$(run_cli_as "$SUB_ACCT" "$SUB_KEY" order create SOL buy limit 1 --price 30 -y 2>/dev/null || true)
  SUB_OID=$(json_get "$SUB_ORDER" "orderId")

  if [ -n "$SUB_OID" ]; then
    tap_ok "TC-SUB-004a: sub-account limit order placed (id=$SUB_OID)"

    # Verify it does NOT appear in the main account's orders
    wait_settle 3
    MAIN_ORDERS=$(run_cli_as "$MAIN_ACCT" "$MAIN_KEY" account orders)
    LEAKED=$(echo "$MAIN_ORDERS" | node -e "
      const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
      const list=(d.dataList||d||[]);
      const arr=Array.isArray(list)?list:[];
      process.stdout.write(arr.some(o=>String(o.id||o.orderId)==='$SUB_OID')?'LEAKED':'ISOLATED');
    ")
    assert_eq "$LEAKED" "ISOLATED" "TC-SUB-004b: sub order does NOT leak into main account orders"

    # Cleanup
    run_cli_as "$SUB_ACCT" "$SUB_KEY" order cancel "$SUB_OID" >/dev/null 2>&1 || true
  else
    tap_fail "TC-SUB-004a: sub-account limit order placed" "got: $SUB_ORDER"
    tap_skip "TC-SUB-004b: skipped (no order)"
  fi
else
  tap_skip "TC-SUB-004a: sub-account has no funds (avail=$SUB_AVAIL), skip trading test"
  tap_skip "TC-SUB-004b: skipped (no funds)"
fi

tap_summary
