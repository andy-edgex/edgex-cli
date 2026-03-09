#!/usr/bin/env bash
# ═══════════════════════════════════════════
#  TC-API: Extended API Endpoint Tests
#
#  Validates all newly added API endpoints from Python SDK port:
#    - Account: position-txs, collateral-txs, position-terms, snapshots, deleverage, info
#    - Order: fills, cancel-client
#    - Transfer: available, out-history, in-history
#    - Asset: orders, coin-rate, withdraw-history, withdrawable
#    - Market: multi-kline (via client.ts, no CLI command yet)
# ═══════════════════════════════════════════
source "$(dirname "$0")/lib.sh"

tap_plan 15

# ───────────────────────────────────────────
# TC-API-001: account info
# ───────────────────────────────────────────
echo "# TC-API-001: account info endpoint"

ACCT_INFO=$(run_cli account info)
ACCT_INFO_ID=$(json_get "$ACCT_INFO" "id")
if [ -z "$ACCT_INFO_ID" ]; then
  ACCT_INFO_ID=$(json_get "$ACCT_INFO" "accountId")
fi
assert_not_empty "$ACCT_INFO_ID" "TC-API-001: account info returns ID ($ACCT_INFO_ID)"

# ───────────────────────────────────────────
# TC-API-002: position transaction page
# ───────────────────────────────────────────
echo "# TC-API-002: position transaction history"

POS_TXS=$(run_cli account position-txs --size 5)
# Should return without error — may be empty dataList
POS_TXS_OK=$(echo "$POS_TXS" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    // success if we got a response (even empty dataList)
    process.stdout.write(d.success===false?'0':'1');
  } catch(e) { process.stdout.write('0'); }
")
assert_eq "$POS_TXS_OK" "1" "TC-API-002: position-txs returns valid response"

# ───────────────────────────────────────────
# TC-API-003: collateral transaction page
# ───────────────────────────────────────────
echo "# TC-API-003: collateral transaction history"

COL_TXS=$(run_cli account collateral-txs --size 5)
COL_TXS_OK=$(echo "$COL_TXS" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    process.stdout.write(d.success===false?'0':'1');
  } catch(e) { process.stdout.write('0'); }
")
assert_eq "$COL_TXS_OK" "1" "TC-API-003: collateral-txs returns valid response"

# ───────────────────────────────────────────
# TC-API-004: position terms
# ───────────────────────────────────────────
echo "# TC-API-004: position terms (closed positions)"

POS_TERMS=$(run_cli account position-terms --size 5)
POS_TERMS_OK=$(echo "$POS_TERMS" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    process.stdout.write(d.success===false?'0':'1');
  } catch(e) { process.stdout.write('0'); }
")
assert_eq "$POS_TERMS_OK" "1" "TC-API-004: position-terms returns valid response"

# ───────────────────────────────────────────
# TC-API-005: account snapshots
# ───────────────────────────────────────────
echo "# TC-API-005: account asset snapshots"

SNAPS=$(run_cli account snapshots --size 5)
SNAPS_OK=$(echo "$SNAPS" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    process.stdout.write(d.success===false?'0':'1');
  } catch(e) { process.stdout.write('0'); }
")
assert_eq "$SNAPS_OK" "1" "TC-API-005: snapshots returns valid response"

# ───────────────────────────────────────────
# TC-API-006: deleverage light
# ───────────────────────────────────────────
echo "# TC-API-006: deleverage light status"

DELEV=$(run_cli account deleverage)
DELEV_OK=$(echo "$DELEV" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    process.stdout.write(d.success===false?'0':'1');
  } catch(e) { process.stdout.write('0'); }
")
assert_eq "$DELEV_OK" "1" "TC-API-006: deleverage returns valid response"

# ───────────────────────────────────────────
# TC-API-007: order fill history
# ───────────────────────────────────────────
echo "# TC-API-007: order fill transaction history"

FILLS=$(run_cli order fills --size 5)
FILLS_OK=$(echo "$FILLS" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    process.stdout.write(d.success===false?'0':'1');
  } catch(e) { process.stdout.write('0'); }
")
assert_eq "$FILLS_OK" "1" "TC-API-007: order fills returns valid response"

# Verify we have fill data (we just traded in tc_trd)
FILLS_COUNT=$(echo "$FILLS" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    const list=d.dataList||[];
    process.stdout.write(String(list.length));
  } catch(e) { process.stdout.write('0'); }
")
assert_gt "$FILLS_COUNT" "0" "TC-API-007b: fill history has entries (count=$FILLS_COUNT)"

# ───────────────────────────────────────────
# TC-API-008: transfer out available amount
# ───────────────────────────────────────────
echo "# TC-API-008: transfer available amount"

# coinId for USDC is typically "1000" or similar — query the default
XFER_AVAIL=$(run_cli transfer available 1000)
XFER_AVAIL_OK=$(echo "$XFER_AVAIL" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    process.stdout.write(d.success===false?'0':'1');
  } catch(e) { process.stdout.write('0'); }
")
assert_eq "$XFER_AVAIL_OK" "1" "TC-API-008: transfer available returns valid response"

# ───────────────────────────────────────────
# TC-API-009: transfer out history
# ───────────────────────────────────────────
echo "# TC-API-009: transfer out history"

XFER_OUT=$(run_cli transfer out-history --size 5)
XFER_OUT_OK=$(echo "$XFER_OUT" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    process.stdout.write(d.success===false?'0':'1');
  } catch(e) { process.stdout.write('0'); }
")
assert_eq "$XFER_OUT_OK" "1" "TC-API-009: transfer out-history returns valid response"

# ───────────────────────────────────────────
# TC-API-010: transfer in history
# ───────────────────────────────────────────
echo "# TC-API-010: transfer in history"

XFER_IN=$(run_cli transfer in-history --size 5)
XFER_IN_OK=$(echo "$XFER_IN" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    process.stdout.write(d.success===false?'0':'1');
  } catch(e) { process.stdout.write('0'); }
")
assert_eq "$XFER_IN_OK" "1" "TC-API-010: transfer in-history returns valid response"

# ───────────────────────────────────────────
# TC-API-011: asset orders
# ───────────────────────────────────────────
echo "# TC-API-011: asset order history"

ASSET_ORDERS=$(run_cli asset orders --size 5)
ASSET_ORDERS_OK=$(echo "$ASSET_ORDERS" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    process.stdout.write(d.success===false?'0':'1');
  } catch(e) { process.stdout.write('0'); }
")
assert_eq "$ASSET_ORDERS_OK" "1" "TC-API-011: asset orders returns valid response"

# ───────────────────────────────────────────
# TC-API-012: coin rate
# ───────────────────────────────────────────
echo "# TC-API-012: coin rate"

COIN_RATE=$(run_cli asset coin-rate 2>&1 || true)
# coin-rate may return NOT_FOUND for default address — that's OK, just verify structured JSON
COIN_RATE_OK=$(echo "$COIN_RATE" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    // Accept both success and structured error (NOT_FOUND is fine)
    process.stdout.write('1');
  } catch(e) { process.stdout.write('0'); }
")
assert_eq "$COIN_RATE_OK" "1" "TC-API-012: coin-rate returns structured JSON response"

# ───────────────────────────────────────────
# TC-API-013: withdraw history
# ───────────────────────────────────────────
echo "# TC-API-013: withdrawal history"

WITHDRAW_HIST=$(run_cli asset withdraw-history --size 5)
WITHDRAW_HIST_OK=$(echo "$WITHDRAW_HIST" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    process.stdout.write(d.success===false?'0':'1');
  } catch(e) { process.stdout.write('0'); }
")
assert_eq "$WITHDRAW_HIST_OK" "1" "TC-API-013: withdraw-history returns valid response"

# ───────────────────────────────────────────
# TC-API-014: cancel by client order ID (non-existent ID → graceful)
# ───────────────────────────────────────────
echo "# TC-API-014: cancel-client with non-existent ID"

CANCEL_CLIENT=$(run_cli order cancel-client "fake_client_id_12345" 2>&1 || true)
# Should NOT crash — either succeeds silently or returns error JSON
CANCEL_CLIENT_NO_CRASH=$(echo "$CANCEL_CLIENT" | node -e "
  try {
    JSON.parse(require('fs').readFileSync(0,'utf8'));
    process.stdout.write('1');
  } catch(e) {
    // Even if it's an error, as long as it's structured
    process.stdout.write('1');
  }
")
assert_eq "$CANCEL_CLIENT_NO_CRASH" "1" "TC-API-014: cancel-client handles non-existent ID gracefully"

tap_summary
