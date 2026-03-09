#!/usr/bin/env bash
# ─── Shared test helpers ───

set -euo pipefail

# ─── Config ───
CLI_BIN="node ${CLI_PATH:-$(cd "$(dirname "$0")/../.." && pwd)/dist/index.js}"
export EDGEX_ACCOUNT_ID="${EDGEX_ACCOUNT_ID:?Set EDGEX_ACCOUNT_ID}"
export EDGEX_STARK_PRIVATE_KEY="${EDGEX_STARK_PRIVATE_KEY:?Set EDGEX_STARK_PRIVATE_KEY}"

# TAP counters
_TAP_N=0
_TAP_FAIL=0

tap_plan() {
  echo "TAP version 13"
  echo "1..$1"
}

tap_ok() {
  _TAP_N=$((_TAP_N + 1))
  echo "ok $_TAP_N - $1"
}

tap_fail() {
  _TAP_N=$((_TAP_N + 1))
  _TAP_FAIL=$((_TAP_FAIL + 1))
  echo "not ok $_TAP_N - $1"
  [ -n "${2:-}" ] && echo "  ---" && echo "  message: $2" && echo "  ---"
}

tap_skip() {
  _TAP_N=$((_TAP_N + 1))
  echo "ok $_TAP_N - # SKIP $1"
}

tap_summary() {
  echo ""
  if [ "$_TAP_FAIL" -eq 0 ]; then
    echo "# All $_TAP_N tests passed"
  else
    echo "# $_TAP_FAIL of $_TAP_N tests FAILED"
  fi
  return "$_TAP_FAIL"
}

# ─── CLI wrapper ───
# Usage: run_cli market ticker BTC
# Captures JSON stdout, returns exit code
run_cli() {
  $CLI_BIN "$@" --json 2>/dev/null
}

# ─── JSON helpers (requires node) ───
# Usage: json_get "$json" '.field.path'
json_get() {
  echo "$1" | node -e "
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    const path='$2'.split('.').filter(Boolean);
    let v=d;
    for(const p of path){
      if(Array.isArray(v)&&/^\d+$/.test(p)) v=v[parseInt(p)];
      else if(v!=null) v=v[p];
      else { v=undefined; break; }
    }
    if(v===undefined||v===null) process.stdout.write('');
    else process.stdout.write(String(v));
  "
}

# Usage: json_len "$json" '.arrayField'
json_len() {
  echo "$1" | node -e "
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    const path='$2'.split('.').filter(Boolean);
    let v=d;
    for(const p of path){
      if(Array.isArray(v)&&/^\d+$/.test(p)) v=v[parseInt(p)];
      else if(v!=null) v=v[p];
      else { v=undefined; break; }
    }
    process.stdout.write(String(Array.isArray(v)?v.length:0));
  "
}

# Usage: json_is_error "$json" → returns 0 if it's an error response
json_is_error() {
  local success
  success=$(json_get "$1" "success")
  [ "$success" = "false" ]
}

# ─── Numeric helpers ───
# Usage: assert_gt "$val" "$threshold" "description"
assert_gt() {
  local result
  result=$(node -e "process.stdout.write(parseFloat('$1')>parseFloat('$2')?'1':'0')")
  if [ "$result" = "1" ]; then
    tap_ok "$3"
  else
    tap_fail "$3" "expected $1 > $2"
  fi
}

assert_lt() {
  local result
  result=$(node -e "process.stdout.write(parseFloat('$1')<parseFloat('$2')?'1':'0')")
  if [ "$result" = "1" ]; then
    tap_ok "$3"
  else
    tap_fail "$3" "expected $1 < $2"
  fi
}

assert_eq() {
  if [ "$1" = "$2" ]; then
    tap_ok "$3"
  else
    tap_fail "$3" "expected '$2', got '$1'"
  fi
}

assert_not_empty() {
  if [ -n "$1" ]; then
    tap_ok "$2"
  else
    tap_fail "$2" "value was empty"
  fi
}

assert_numeric() {
  local result
  result=$(node -e "const n=parseFloat('$1');process.stdout.write(!isNaN(n)&&n>0?'1':'0')")
  if [ "$result" = "1" ]; then
    tap_ok "$2"
  else
    tap_fail "$2" "expected positive number, got '$1'"
  fi
}

# ─── CLI with credential override ───
# Usage: run_cli_as <account_id> <stark_key> market ticker BTC
run_cli_as() {
  local acct="$1" key="$2"
  shift 2
  EDGEX_ACCOUNT_ID="$acct" EDGEX_STARK_PRIVATE_KEY="$key" $CLI_BIN "$@" --json 2>/dev/null
}

# ─── Interactive prompt (for semi-automated tests) ───
prompt_user() {
  echo "" >&2
  echo "  ┌──────────────────────────────────────────────" >&2
  echo "  │  $1" >&2
  echo "  └──────────────────────────────────────────────" >&2
  read -rp "  Press Enter when ready... " < /dev/tty
}

# ─── Polling helper ───
# Usage: poll_until_changed <field_path> <old_value> <max_seconds> <description>
# Polls account balances every 3s until field changes or timeout
poll_balance_field() {
  local field_path="$1" old_val="$2" max_secs="${3:-60}" desc="${4:-field}"
  local elapsed=0 interval=3
  while [ "$elapsed" -lt "$max_secs" ]; do
    local bal new_val
    bal=$(run_cli account balances)
    new_val=$(json_get "$bal" "$field_path")
    local changed
    changed=$(node -e "
      const o=parseFloat('$old_val'||'0'), n=parseFloat('$new_val'||'0');
      process.stdout.write(Math.abs(n-o)>0.000001?'1':'0');
    ")
    if [ "$changed" = "1" ]; then
      echo "$new_val"
      return 0
    fi
    sleep "$interval"
    elapsed=$((elapsed + interval))
    echo "  ... polling $desc (${elapsed}s / ${max_secs}s)" >&2
  done
  echo "$old_val"
  return 1
}

# ─── Delay helper ───
wait_settle() {
  sleep "${1:-2}"
}
