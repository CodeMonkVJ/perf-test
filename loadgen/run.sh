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

echo "Running load test against ${BASE_URL}${TARGET_PATH:-/}"
k6 run --summary-export "$OUT" loadtest.js

echo "Saved summary to $OUT"
