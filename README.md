# VPS Proxy Benchmark Kit

This setup gives you **authorized load testing** (not DDoS tooling) for your own infrastructure:

- `monitoring/`: run on your home server (Prometheus + Grafana + node-exporter + cAdvisor)
- `loadgen/`: run from an external machine to stress your VPS proxy path with `k6`

## 1) Home server monitoring

Run on your home server:

```bash
cd monitoring
docker compose up -d
```

Open:

- Prometheus: `http://<home-server-ip>:9090`
- Grafana: `http://<home-server-ip>:3300` (default `admin/admin`)
- cAdvisor: `http://<home-server-ip>:8180`

In Grafana, add Prometheus datasource URL: `http://prometheus:9090`.

Import ready dashboard:

1. Grafana -> `Dashboards` -> `New` -> `Import`
2. Upload `monitoring/grafana-dashboard-vps-capacity.json`
3. Select your Prometheus datasource and click `Import`
4. After you send k6 metrics via Remote Write, use `k6 Test Run` variable in the dashboard to filter run graphs

Prometheus is configured with Remote Write receiver enabled, so k6 can push run metrics directly.

## 2) External load generator

Install k6 on the external machine, then:

```bash
cd loadgen
BASE_URL=https://your-vps-domain.com TARGET_PATH=/health ./run.sh
```

Tunable env vars:

- `START_RPS` (default `10`)
- `STAGE1_RPS..STAGE4_RPS` (default `50,100,200,400`)
- `STAGE1_DUR..STAGE4_DUR` (default `2m` each)
- `PRE_VUS` (default `100`)
- `MAX_VUS` (default `2000`)
- `REQ_TIMEOUT` (default `5s`)
- `COOKIE_HEADER` (optional, full cookie header string, e.g. `sessiondata=abc123; other=xyz`)
- `SESSION_COOKIE` (optional shortcut for `sessiondata=<value>`)
- `RUN_ID` (optional, tags all series as `test_run=<RUN_ID>`, default timestamp)
- `PROM_RW_URL` (optional, if set, stream live k6 metrics to Prometheus; example `http://100.x.y.z:9090/api/v1/write`)
- `K6_PROM_OUTPUT` (optional, default `experimental-prometheus-rw`; for older k6 use `prometheus-rw`)

Example with cookie-based session:

```bash
cd loadgen
BASE_URL=https://perftest.domain.com \
TARGET_PATH=/api/secure-endpoint \
COOKIE_HEADER='sessiondata=abc123; csrftoken=def456' \
./run.sh
```

Example with Prometheus Remote Write enabled:

```bash
cd loadgen
BASE_URL=https://perftest.domain.com \
TARGET_PATH=/api/secure-endpoint \
COOKIE_HEADER='sessiondata=abc123; csrftoken=def456' \
RUN_ID=baseline-01 \
PROM_RW_URL=http://100.x.y.z:9090/api/v1/write \
./run.sh
```

After the run, in Prometheus/Grafana Explore, search k6 metrics with:

```promql
{__name__=~"k6_.*", test_run="baseline-01"}
```

## 3) How to decide max supported users

Treat the max stable point as the highest stage where all stay true:

- `http_req_failed < 1%`
- `p95 latency < 500ms` (or your SLO)
- VPS CPU sustained below ~85%
- No sustained packet drops / retransmits

Convert stable RPS into user estimate:

```text
max_users ~= stable_rps * seconds_between_user_requests
```

Example: if stable is `180 RPS` and each user makes one request every `6s`, max users ~= `1080`.

## 4) Notes for your topology (VPS proxy -> Tailscale -> home)

Your bottleneck can be any of:

- VPS vCPU saturation
- VPS network cap
- Tailscale tunnel throughput/latency
- home upload bandwidth
- app server limits at home

Run tests in steps and stop once error rate or latency crosses target.
