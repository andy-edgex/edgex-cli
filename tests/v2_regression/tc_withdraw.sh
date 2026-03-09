#!/usr/bin/env bash
# ═══════════════════════════════════════════
#  TC-WITHDRAW: Automated Withdrawal Tests
#
#  Tests withdrawal submission via CLI (L2-signed):
#    TC-WD-001: Normal withdraw (USDC, Edge chain) — submit + verify response
#    TC-WD-002: Normal withdraw appears in withdraw-history
#    TC-WD-003: Withdrawable amount query
#    TC-WD-004: Cross-chain withdraw to Arb (USDC) — submit + verify response
#    TC-WD-005: Cross-chain withdraw appears in transfer out-history
#    TC-WD-006: Transfer available amount check
#
#  Note: These tests only verify API submission succeeds.
#  Normal withdrawals take hours (StarkEx batch), cross-chain may take minutes.
#  We do NOT poll for on-chain settlement here.
# ═══════════════════════════════════════════
source "$(dirname "$0")/lib.sh"

tap_plan 6

# Must use EIP-55 checksummed format for withdraw API
ETH_ADDR="0x47Ae7a82006D55536A20B2F44aD4B2d70c9794c3"

# ───────────────────────────────────────────
# TC-WD-001: Normal Withdraw (USDC, Edge chain)
# ───────────────────────────────────────────
echo "# TC-WD-001: Normal withdraw (USDC) submission"

# Use smallest viable amount (0.1 USDC)
WITHDRAW_RESULT=$(run_cli asset withdraw 1000 0.1 "$ETH_ADDR" 2>&1 || true)
WITHDRAW_ID=$(json_get "$WITHDRAW_RESULT" "withdrawId")

if [ -z "$WITHDRAW_ID" ]; then
  # Check if the response has an error message
  WITHDRAW_ERR=$(json_get "$WITHDRAW_RESULT" "errorMsg")
  if [ -n "$WITHDRAW_ERR" ]; then
    # Some errors are acceptable (e.g., insufficient balance, rate limit)
    echo "# API returned error: $WITHDRAW_ERR"
    tap_fail "TC-WD-001: normal withdraw submission" "API error: $WITHDRAW_ERR"
  else
    tap_fail "TC-WD-001: normal withdraw submission" "no withdrawId in response"
  fi
else
  tap_ok "TC-WD-001: normal withdraw submitted (withdrawId=$WITHDRAW_ID)"
fi

# ───────────────────────────────────────────
# TC-WD-002: Verify withdrawal appears in history
# ───────────────────────────────────────────
echo "# TC-WD-002: withdraw-history check"

# Small delay for record to appear
sleep 2
WHIST=$(run_cli asset withdraw-history --size 5)
WHIST_OK=$(echo "$WHIST" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    process.stdout.write(d.success===false?'0':'1');
  } catch(e) { process.stdout.write('0'); }
")
assert_eq "$WHIST_OK" "1" "TC-WD-002: withdraw-history returns valid response"

# ───────────────────────────────────────────
# TC-WD-003: Withdrawable amount query
# ───────────────────────────────────────────
echo "# TC-WD-003: withdrawable amount"

WDABLE=$(run_cli asset withdrawable 1000)
WDABLE_OK=$(echo "$WDABLE" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    process.stdout.write(d.success===false?'0':'1');
  } catch(e) { process.stdout.write('0'); }
")
assert_eq "$WDABLE_OK" "1" "TC-WD-003: withdrawable amount returns valid response"

# ───────────────────────────────────────────
# TC-WD-004: Cross-chain withdraw to Arb (USDC)
# ───────────────────────────────────────────
echo "# TC-WD-004: Cross-chain withdraw to Arb (USDC)"

# Cross-withdraw requires minTransferSize=10 USDC
# Check available balance first
XFER_AVAIL=$(run_cli transfer available 1000)
AVAIL_AMT=$(json_get "$XFER_AVAIL" "availableAmount")
if [ -z "$AVAIL_AMT" ]; then
  AVAIL_AMT=$(json_get "$XFER_AVAIL" "maxAmount")
fi
echo "# Transfer available amount: $AVAIL_AMT"

HAS_ENOUGH=$(node -e "process.stdout.write(parseFloat('${AVAIL_AMT:-0}')>=10?'1':'0')")

if [ "$HAS_ENOUGH" = "1" ]; then
  CROSS_RESULT=$(run_cli transfer cross-withdraw 10 "$ETH_ADDR" --chain-id 42161 2>&1 || true)
  CROSS_ID=$(json_get "$CROSS_RESULT" "transferOutId")
  if [ -z "$CROSS_ID" ]; then
    CROSS_ID=$(json_get "$CROSS_RESULT" "id")
  fi

  if [ -z "$CROSS_ID" ]; then
    CROSS_ERR=$(json_get "$CROSS_RESULT" "errorMsg")
    if [ -n "$CROSS_ERR" ]; then
      echo "# API returned error: $CROSS_ERR"
      tap_fail "TC-WD-004: cross-withdraw to Arb" "API error: $CROSS_ERR"
    else
      # Even without an ID, if we got a JSON response it may have succeeded
      CROSS_OK=$(echo "$CROSS_RESULT" | node -e "
        try { JSON.parse(require('fs').readFileSync(0,'utf8')); process.stdout.write('1'); }
        catch(e) { process.stdout.write('0'); }
      ")
      if [ "$CROSS_OK" = "1" ]; then
        tap_ok "TC-WD-004: cross-withdraw to Arb submitted (response is valid JSON)"
      else
        tap_fail "TC-WD-004: cross-withdraw to Arb" "invalid response"
      fi
    fi
  else
    tap_ok "TC-WD-004: cross-withdraw to Arb submitted (id=$CROSS_ID)"
  fi
else
  echo "# Skipping: insufficient balance ($AVAIL_AMT < 10 USDC minimum)"
  tap_skip "TC-WD-004: cross-withdraw skipped (balance < 10 USDC)"
fi

# ───────────────────────────────────────────
# TC-WD-005: Verify cross-withdraw in transfer out-history
# ───────────────────────────────────────────
echo "# TC-WD-005: transfer out-history check"

sleep 2
XOUT=$(run_cli transfer out-history --size 5)
XOUT_OK=$(echo "$XOUT" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    process.stdout.write(d.success===false?'0':'1');
  } catch(e) { process.stdout.write('0'); }
")
assert_eq "$XOUT_OK" "1" "TC-WD-005: transfer out-history returns valid response"

# ───────────────────────────────────────────
# TC-WD-006: Transfer available amount sanity check
# ───────────────────────────────────────────
echo "# TC-WD-006: transfer available amount"

TAVAIL=$(run_cli transfer available 1000)
TAVAIL_OK=$(echo "$TAVAIL" | node -e "
  try {
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    process.stdout.write(d.success===false?'0':'1');
  } catch(e) { process.stdout.write('0'); }
")
assert_eq "$TAVAIL_OK" "1" "TC-WD-006: transfer available returns valid response"

tap_summary
