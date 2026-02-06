#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${BASE_URL:-}" ]]; then
  echo "BASE_URL is required"
  echo "Example: BASE_URL=https://your-vps-domain.com TARGET_PATH=/health ./run.sh"
  exit 1
fi

mkdir -p results
TS="$(date +%Y%m%d-%H%M%S)"
OUT="results/k6-${TS}.json"
RUN_ID="${RUN_ID:-$TS}"

echo "Running load test against ${BASE_URL}${TARGET_PATH:-/}"

if [[ -n "${PROM_RW_URL:-}" ]]; then
  # Default output name used by current k6 versions. For older versions, set K6_PROM_OUTPUT=prometheus-rw.
  K6_PROM_OUTPUT="${K6_PROM_OUTPUT:-experimental-prometheus-rw}"

  export K6_PROMETHEUS_RW_TREND_STATS="${K6_PROMETHEUS_RW_TREND_STATS:-p(90),p(95),p(99),avg,min,max}"
  export K6_PROMETHEUS_RW_PUSH_INTERVAL="${K6_PROMETHEUS_RW_PUSH_INTERVAL:-5s}"
  export K6_PROMETHEUS_RW_STALE_MARKERS="${K6_PROMETHEUS_RW_STALE_MARKERS:-true}"

  echo "Streaming k6 metrics to Prometheus Remote Write: ${PROM_RW_URL}"
  echo "Run label: test_run=${RUN_ID}"
  k6 run --summary-export "$OUT" --tag "test_run=${RUN_ID}" -o "${K6_PROM_OUTPUT}=${PROM_RW_URL}" loadtest.js
else
  k6 run --summary-export "$OUT" --tag "test_run=${RUN_ID}" loadtest.js
fi

echo "Saved summary to $OUT"
