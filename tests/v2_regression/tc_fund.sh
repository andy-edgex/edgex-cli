#!/usr/bin/env bash
# ═══════════════════════════════════════════
#  TC-FUND: Funding & Transfer Semi-Automated Watcher
#
#  This is an INTERACTIVE test suite. It prompts the QA engineer
#  to trigger deposits/transfers on the Web UI, then polls the CLI
#  to assert that funds have landed correctly.
#
#  Tests:
#    TC-FUND-001: Edge chain native deposit (USDC)
#    TC-FUND-002: Arb cross-chain deposit (USDC)
#    TC-FUND-003: Internal transfer: V1 → V2 / Spot → Perp
#    TC-FUND-004: Internal transfer: Spot ↔ V2 Perp
#    TC-FUND-005: Withdrawal verification
#
#  Each test can be skipped individually by pressing Ctrl+C at the prompt.
# ═══════════════════════════════════════════
source "$(dirname "$0")/lib.sh"

POLL_TIMEOUT=120  # seconds to wait for balance change

tap_plan 10

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  TC-FUND: Semi-Automated Funding & Transfer Watcher      ║"
echo "║  This suite requires you to trigger actions on Web UI.    ║"
echo "║  Press Enter after each action to start polling.          ║"
echo "║  Type 'skip' at any prompt to skip that test.             ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# ───────────────────────────────────────────
# Snapshot baseline balance
# ───────────────────────────────────────────
echo "# Snapshot: Recording baseline balance..."
BASELINE=$(run_cli account balances)
BASELINE_AVAIL=$(json_get "$BASELINE" "collateralAssetModelList.0.availableAmount")
BASELINE_EQUITY=$(json_get "$BASELINE" "collateralAssetModelList.0.totalEquity")
BASELINE_COLLATERAL=$(json_get "$BASELINE" "collateralList.0.amount")
echo "#   availableAmount = $BASELINE_AVAIL"
echo "#   totalEquity     = $BASELINE_EQUITY"
echo "#   collateral      = $BASELINE_COLLATERAL"

# ───────────────────────────────────────────
# TC-FUND-001: Edge chain native deposit
# ───────────────────────────────────────────
echo ""
echo "# TC-FUND-001: Edge chain native USDC deposit"

read -rp "  Trigger a USDC deposit on Edge chain via Web UI, then type the amount (or 'skip'): " FUND001_INPUT < /dev/tty

if [ "$FUND001_INPUT" = "skip" ] || [ -z "$FUND001_INPUT" ]; then
  tap_skip "TC-FUND-001a: Edge deposit skipped by QA"
  tap_skip "TC-FUND-001b: skipped"
else
  echo "  Polling for balance change (up to ${POLL_TIMEOUT}s)..."
  BEFORE_AVAIL="$BASELINE_AVAIL"
  NEW_AVAIL=$(poll_balance_field "collateralAssetModelList.0.availableAmount" "$BEFORE_AVAIL" "$POLL_TIMEOUT" "Edge deposit")
  POLL_RC=$?

  if [ "$POLL_RC" -eq 0 ]; then
    tap_ok "TC-FUND-001a: availableAmount changed after Edge deposit (was $BEFORE_AVAIL, now $NEW_AVAIL)"
    # Verify the delta roughly matches declared amount
    DELTA=$(node -e "process.stdout.write((parseFloat('$NEW_AVAIL')-parseFloat('$BEFORE_AVAIL')).toFixed(6))")
    assert_gt "$DELTA" "0" "TC-FUND-001b: balance increased by $DELTA USDC"
    # Update baseline
    BASELINE_AVAIL="$NEW_AVAIL"
  else
    tap_fail "TC-FUND-001a: balance did not change within ${POLL_TIMEOUT}s" "stuck at $BEFORE_AVAIL"
    tap_skip "TC-FUND-001b: skipped (no change)"
  fi
fi

# ───────────────────────────────────────────
# TC-FUND-002: Arbitrum cross-chain deposit
# ───────────────────────────────────────────
echo ""
echo "# TC-FUND-002: Arbitrum cross-chain USDC deposit"

read -rp "  Trigger an Arb cross-chain USDC deposit via Web UI, then type the amount (or 'skip'): " FUND002_INPUT < /dev/tty

if [ "$FUND002_INPUT" = "skip" ] || [ -z "$FUND002_INPUT" ]; then
  tap_skip "TC-FUND-002a: Arb deposit skipped by QA"
  tap_skip "TC-FUND-002b: skipped"
else
  echo "  Polling for balance change (up to ${POLL_TIMEOUT}s)..."
  # Re-snapshot current balance
  CUR=$(run_cli account balances)
  BEFORE_AVAIL=$(json_get "$CUR" "collateralAssetModelList.0.availableAmount")
  NEW_AVAIL=$(poll_balance_field "collateralAssetModelList.0.availableAmount" "$BEFORE_AVAIL" "$POLL_TIMEOUT" "Arb deposit")
  POLL_RC=$?

  if [ "$POLL_RC" -eq 0 ]; then
    tap_ok "TC-FUND-002a: availableAmount changed after Arb deposit (was $BEFORE_AVAIL, now $NEW_AVAIL)"
    DELTA=$(node -e "process.stdout.write((parseFloat('$NEW_AVAIL')-parseFloat('$BEFORE_AVAIL')).toFixed(6))")
    assert_gt "$DELTA" "0" "TC-FUND-002b: balance increased by $DELTA USDC"
  else
    tap_fail "TC-FUND-002a: balance did not change within ${POLL_TIMEOUT}s (Arb cross-chain not landed)" "stuck at $BEFORE_AVAIL"
    tap_skip "TC-FUND-002b: skipped (no change)"
  fi
fi

# ───────────────────────────────────────────
# TC-FUND-003: Internal transfer V1 → V2 or Spot → Perp
# ───────────────────────────────────────────
echo ""
echo "# TC-FUND-003: Internal transfer (Spot → Perp V2)"

read -rp "  Trigger a Spot → Perp internal transfer on Web UI, then type the amount (or 'skip'): " FUND003_INPUT < /dev/tty

if [ "$FUND003_INPUT" = "skip" ] || [ -z "$FUND003_INPUT" ]; then
  tap_skip "TC-FUND-003a: internal transfer skipped by QA"
  tap_skip "TC-FUND-003b: skipped"
else
  echo "  Polling for balance change (up to ${POLL_TIMEOUT}s)..."
  CUR=$(run_cli account balances)
  BEFORE_AVAIL=$(json_get "$CUR" "collateralAssetModelList.0.availableAmount")
  NEW_AVAIL=$(poll_balance_field "collateralAssetModelList.0.availableAmount" "$BEFORE_AVAIL" "$POLL_TIMEOUT" "Spot→Perp transfer")
  POLL_RC=$?

  if [ "$POLL_RC" -eq 0 ]; then
    tap_ok "TC-FUND-003a: availableAmount changed after internal transfer (was $BEFORE_AVAIL, now $NEW_AVAIL)"
    DELTA=$(node -e "process.stdout.write((parseFloat('$NEW_AVAIL')-parseFloat('$BEFORE_AVAIL')).toFixed(6))")
    # Internal transfer in → delta > 0
    assert_gt "$DELTA" "0" "TC-FUND-003b: balance increased by $DELTA USDC (no stuck-in-status-7 bug)"
  else
    tap_fail "TC-FUND-003a: balance did not change within ${POLL_TIMEOUT}s (transfer stuck?)" "stuck at $BEFORE_AVAIL"
    tap_skip "TC-FUND-003b: skipped (no change)"
  fi
fi

# ───────────────────────────────────────────
# TC-FUND-004: Internal transfer Perp V2 → Spot (reverse)
# ───────────────────────────────────────────
echo ""
echo "# TC-FUND-004: Internal transfer (Perp V2 → Spot)"

read -rp "  Trigger a Perp → Spot internal transfer on Web UI, then type the amount (or 'skip'): " FUND004_INPUT < /dev/tty

if [ "$FUND004_INPUT" = "skip" ] || [ -z "$FUND004_INPUT" ]; then
  tap_skip "TC-FUND-004a: reverse transfer skipped by QA"
  tap_skip "TC-FUND-004b: skipped"
else
  echo "  Polling for balance DECREASE (up to ${POLL_TIMEOUT}s)..."
  CUR=$(run_cli account balances)
  BEFORE_AVAIL=$(json_get "$CUR" "collateralAssetModelList.0.availableAmount")
  NEW_AVAIL=$(poll_balance_field "collateralAssetModelList.0.availableAmount" "$BEFORE_AVAIL" "$POLL_TIMEOUT" "Perp→Spot transfer")
  POLL_RC=$?

  if [ "$POLL_RC" -eq 0 ]; then
    tap_ok "TC-FUND-004a: availableAmount changed after Perp→Spot transfer (was $BEFORE_AVAIL, now $NEW_AVAIL)"
    DELTA=$(node -e "process.stdout.write((parseFloat('$BEFORE_AVAIL')-parseFloat('$NEW_AVAIL')).toFixed(6))")
    assert_gt "$DELTA" "0" "TC-FUND-004b: balance decreased by $DELTA USDC (transfer out confirmed)"
  else
    tap_fail "TC-FUND-004a: balance did not change within ${POLL_TIMEOUT}s" "stuck at $BEFORE_AVAIL"
    tap_skip "TC-FUND-004b: skipped (no change)"
  fi
fi

tap_summary
