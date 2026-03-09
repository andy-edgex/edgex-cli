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

# ─── Default to testnet ───
export EDGEX_TESTNET="${EDGEX_TESTNET:-1}"

# ─── Load .env if present ───
if [ -f "$REPO_ROOT/.env" ]; then
  # Collect all env fields from .env
  declare -A ENV_MAP
  while IFS= read -r line; do
    line=$(echo "$line" | sed 's/#.*//' | xargs)
    [ -z "$line" ] && continue
    if echo "$line" | grep -q ':'; then
      key=$(echo "$line" | cut -d: -f1 | xargs | tr ' ' '_' | tr '[:lower:]' '[:upper:]')
      val=$(echo "$line" | cut -d: -f2- | xargs)
    elif echo "$line" | grep -q '='; then
      key=$(echo "$line" | cut -d= -f1 | xargs)
      val=$(echo "$line" | cut -d= -f2- | xargs)
    else
      continue
    fi
    ENV_MAP["$key"]="$val"
  done < "$REPO_ROOT/.env"

  # Pick testnet or mainnet credentials based on EDGEX_TESTNET
  if [ "$EDGEX_TESTNET" = "1" ] || [ "$EDGEX_TESTNET" = "true" ]; then
    # Testnet: prefer TestXxx keys, fall back to mainnet keys
    export EDGEX_STARK_PRIVATE_KEY="0x${ENV_MAP[TESTL2PRIVATEKEY]:-${ENV_MAP[L2PRIAVTEKEY]:-${ENV_MAP[L2PRIVATEKEY]:-}}}"
    export EDGEX_ACCOUNT_ID="${ENV_MAP[TESTACCOUNTID]:-${ENV_MAP[ACCOUNT_ID]:-}}"
    export SUB_ACCOUNT_ID="${ENV_MAP[TestSUB_ACCOUNT_ID]:-${ENV_MAP[TESTSUB_ACCOUNT_ID]:-${ENV_MAP[SUB_ACCOUNT_ID]:-}}}"
    export SUB_STARK_PRIVATE_KEY="${ENV_MAP[TestSUB_STARK_PRIVATE_KEY]:-${ENV_MAP[TESTSUB_STARK_PRIVATE_KEY]:-${ENV_MAP[SUB_STARK_PRIVATE_KEY]:-}}}"
    export ETH_ADDRESS="${ENV_MAP[TESTETH_ADDRESS]:-${ENV_MAP[ETH_ADDRESS]:-}}"
  else
    export EDGEX_STARK_PRIVATE_KEY="0x${ENV_MAP[L2PRIAVTEKEY]:-${ENV_MAP[L2PRIVATEKEY]:-}}"
    export EDGEX_ACCOUNT_ID="${ENV_MAP[ACCOUNT_ID]:-}"
    export SUB_ACCOUNT_ID="${ENV_MAP[SUB_ACCOUNT_ID]:-}"
    export SUB_STARK_PRIVATE_KEY="${ENV_MAP[SUB_STARK_PRIVATE_KEY]:-}"
    export ETH_ADDRESS="${ENV_MAP[ETH_ADDRESS]:-}"
  fi
fi

export EDGEX_ACCOUNT_ID="${EDGEX_ACCOUNT_ID:?Missing EDGEX_ACCOUNT_ID}"
export EDGEX_STARK_PRIVATE_KEY="${EDGEX_STARK_PRIVATE_KEY:?Missing EDGEX_STARK_PRIVATE_KEY}"
export CLI_PATH="$REPO_ROOT/dist/index.js"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TOTAL_FAIL=0

NETWORK="mainnet"
[ "$EDGEX_TESTNET" = "1" ] || [ "$EDGEX_TESTNET" = "true" ] && NETWORK="TESTNET"

echo "════════════════════════════════════════"
echo "  EdgeX V2 Regression Test Suite"
echo "  Network: $NETWORK"
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
