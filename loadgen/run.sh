#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${CONFIG_FILE:-config.env}"
if [[ $# -ge 1 ]]; then
  CONFIG_FILE="$1"
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Config file not found: $CONFIG_FILE"
  echo "Create/edit loadgen/config.env, then run ./run.sh"
  echo "Or pass a custom file: ./run.sh path/to/config.env"
  exit 1
fi

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

load_config() {
  local raw line key value first last

  while IFS= read -r raw || [[ -n "$raw" ]]; do
    line="${raw%$'\r'}"
    line="$(trim "$line")"

    if [[ -z "$line" || "${line:0:1}" == "#" ]]; then
      continue
    fi

    if [[ "$line" != *=* ]]; then
      echo "Invalid config line (expected KEY=value): $line"
      exit 1
    fi

    key="$(trim "${line%%=*}")"
    value="$(trim "${line#*=}")"

    if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      echo "Invalid config key: $key"
      exit 1
    fi

    if [[ ${#value} -ge 2 ]]; then
      first="${value:0:1}"
      last="${value: -1}"
      if [[ ( "$first" == "'" && "$last" == "'" ) || ( "$first" == '"' && "$last" == '"' ) ]]; then
        value="${value:1:${#value}-2}"
      fi
    fi

    export "$key=$value"
  done < "$CONFIG_FILE"
}

load_config

if [[ -z "${BASE_URL:-}" ]]; then
  echo "BASE_URL is required in $CONFIG_FILE"
  exit 1
fi

if ! command -v k6 >/dev/null 2>&1; then
  echo "k6 is not installed or not in PATH"
  exit 1
fi

mkdir -p results
TS="$(date +%Y%m%d-%H%M%S)"
OUT="results/k6-${TS}.json"
RUN_ID="${RUN_ID:-$TS}"

echo "Loaded config: $CONFIG_FILE"
echo "Running load test: ${REQ_METHOD:-GET} ${BASE_URL}${TARGET_PATH:-/}"

if [[ -n "${PROM_RW_URL:-}" ]]; then
  # Default output name used by current k6 versions. For older versions, set K6_PROM_OUTPUT=prometheus-rw.
  K6_PROM_OUTPUT="${K6_PROM_OUTPUT:-experimental-prometheus-rw}"
  export K6_PROMETHEUS_RW_SERVER_URL="${PROM_RW_URL}"

  export K6_PROMETHEUS_RW_TREND_STATS="${K6_PROMETHEUS_RW_TREND_STATS:-p(90),p(95),p(99),avg,min,max}"
  export K6_PROMETHEUS_RW_PUSH_INTERVAL="${K6_PROMETHEUS_RW_PUSH_INTERVAL:-5s}"
  export K6_PROMETHEUS_RW_STALE_MARKERS="${K6_PROMETHEUS_RW_STALE_MARKERS:-true}"

  echo "Streaming k6 metrics to Prometheus Remote Write: ${K6_PROMETHEUS_RW_SERVER_URL}"
  echo "Run label: test_run=${RUN_ID}"
  k6 run --summary-export "$OUT" --tag "test_run=${RUN_ID}" -o "${K6_PROM_OUTPUT}" loadtest.js
else
  k6 run --summary-export "$OUT" --tag "test_run=${RUN_ID}" loadtest.js
fi

echo "Saved summary to $OUT"
