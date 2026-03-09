#!/usr/bin/env bash
# ═══════════════════════════════════════════
#  EdgeX V2 Regression Test Runner
#  Usage: ./tests/v2_regression/runner.sh
# ═══════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPORT_DIR="$SCRIPT_DIR/reports"

mkdir -p "$REPORT_DIR"

# ─── Load .env if present ───
if [ -f "$REPO_ROOT/.env" ]; then
  # Parse key=value, skip comments and colons
  while IFS= read -r line; do
    line=$(echo "$line" | sed 's/#.*//' | xargs)
    [ -z "$line" ] && continue
    # Handle both "Key: value" and "KEY=value" formats
    if echo "$line" | grep -q ':'; then
      key=$(echo "$line" | cut -d: -f1 | xargs | tr ' ' '_' | tr '[:lower:]' '[:upper:]')
      val=$(echo "$line" | cut -d: -f2- | xargs)
    elif echo "$line" | grep -q '='; then
      key=$(echo "$line" | cut -d= -f1 | xargs)
      val=$(echo "$line" | cut -d= -f2- | xargs)
    else
      continue
    fi
    # Map known keys
    case "$key" in
      L2PRIAVTEKEY|L2PRIVATEKEY|L2_PRIVATE_KEY)
        export EDGEX_STARK_PRIVATE_KEY="0x$val"
        ;;
      ACCOUNT_ID|ACCOUNT\ ID)
        export EDGEX_ACCOUNT_ID="$val"
        ;;
      SUB_ACCOUNT_ID)
        export SUB_ACCOUNT_ID="$val"
        ;;
      SUB_STARK_PRIVATE_KEY)
        export SUB_STARK_PRIVATE_KEY="$val"
        ;;
      ETH_ADDRESS)
        export ETH_ADDRESS="$val"
        ;;
    esac
  done < "$REPO_ROOT/.env"
fi

export EDGEX_ACCOUNT_ID="${EDGEX_ACCOUNT_ID:?Missing EDGEX_ACCOUNT_ID}"
export EDGEX_STARK_PRIVATE_KEY="${EDGEX_STARK_PRIVATE_KEY:?Missing EDGEX_STARK_PRIVATE_KEY}"
export CLI_PATH="$REPO_ROOT/dist/index.js"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TOTAL_FAIL=0

echo "════════════════════════════════════════"
echo "  EdgeX V2 Regression Test Suite"
echo "  Account: $EDGEX_ACCOUNT_ID"
echo "  Time:    $(date)"
echo "════════════════════════════════════════"
echo ""

# ─── Determine which suites to run ───
# Default: automated suites. Pass args to select specific suites.
# Usage: runner.sh                    → runs tc_acc tc_trd
#        runner.sh tc_sub             → runs only tc_sub
#        runner.sh tc_fund            → runs only tc_fund (interactive)
#        runner.sh all                → runs all suites
#        runner.sh tc_acc tc_trd tc_sub tc_fund → runs specified suites
if [ $# -gt 0 ]; then
  if [ "$1" = "all" ]; then
    SUITES="tc_acc tc_trd tc_api tc_sub tc_withdraw tc_fund"
  else
    SUITES="$*"
  fi
else
  SUITES="tc_acc tc_trd tc_api tc_sub"
fi

for suite in $SUITES; do
  SUITE_FILE="$SCRIPT_DIR/${suite}.sh"
  REPORT_FILE="$REPORT_DIR/${suite}_${TIMESTAMP}.tap"

  if [ ! -f "$SUITE_FILE" ]; then
    echo "SKIP: $suite (file not found)"
    continue
  fi

  echo "▶ Running $suite ..."
  chmod +x "$SUITE_FILE"

  # Run suite, capture TAP output
  bash "$SUITE_FILE" 2>&1 | tee "$REPORT_FILE"
  SUITE_EXIT=${PIPESTATUS[0]}

  if [ "$SUITE_EXIT" -ne 0 ]; then
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    echo "  ✗ $suite had failures (exit=$SUITE_EXIT)"
  else
    echo "  ✓ $suite passed"
  fi
  echo ""
done

# ─── Final summary ───
echo "════════════════════════════════════════"
if [ "$TOTAL_FAIL" -eq 0 ]; then
  echo "  ALL SUITES PASSED"
else
  echo "  $TOTAL_FAIL SUITE(S) HAD FAILURES"
fi
echo "  Reports saved to: $REPORT_DIR/"
echo "════════════════════════════════════════"

exit "$TOTAL_FAIL"
