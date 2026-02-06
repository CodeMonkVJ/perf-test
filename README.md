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

Install k6 on the external machine, then edit `loadgen/config.env` and run:

```bash
cd loadgen
./run.sh
```

If needed, use a different config file:

```bash
cd loadgen
./run.sh my-other-config.env
```

`config.env` keys you will edit most:

- `BASE_URL`, `TARGET_PATH`
- `REQ_METHOD`, `REQ_BODY`, `REQ_CONTENT_TYPE`, `EXTRA_HEADERS_JSON`, `COOKIE_HEADER`
- `START_RPS`, `RAMP_STAGES`, `PRE_VUS`, `MAX_VUS`
- `PROM_RW_URL`, `RUN_ID`

`config.env` uses plain `KEY=value` lines (not shell scripting), so JSON and cookie strings can be written directly.

Response success criteria: only HTTP `2xx` is treated as success; `3xx/4xx/5xx` are counted as failed requests.

Recommended request changes for realistic results:

- Use the same API endpoint real users hit, not just `/health`.
- Match the real method and payload shape (`REQ_METHOD`, `REQ_BODY`, `REQ_CONTENT_TYPE`).
- Include real auth/session headers or cookies (`COOKIE_HEADER` and/or `EXTRA_HEADERS_JSON`).
- Keep `RAMP_STAGES` gradual to find the exact failure edge; default is:
`50:2m,100:2m,150:2m,200:2m,250:2m,300:2m`

Example config for an authenticated JSON POST:

```ini
BASE_URL=https://perftest.domain.com
TARGET_PATH=/api/checkout
REQ_METHOD=POST
REQ_CONTENT_TYPE=application/json
REQ_BODY={"cartId":"abc123","coupon":"NONE"}
COOKIE_HEADER=sessiondata=abc123; csrftoken=def456
EXTRA_HEADERS_JSON={"Accept":"application/json"}
RAMP_STAGES=50:2m,100:2m,150:2m,200:2m,250:2m,300:2m
PROM_RW_URL=http://100.x.y.z:9090/api/v1/write
```

After the run, in Prometheus/Grafana Explore, search k6 metrics with:

```promql
{__name__=~"k6_.*", test_run="<run-id>"}
```

Delete old k6 runs from Prometheus:

1. Ensure monitoring stack is restarted with admin API enabled:

```bash
cd monitoring
docker compose up -d
```

2. Delete one specific run id (example `baseline-01`):

```bash
curl -X POST -g 'http://<home-server-ip>:9090/api/v1/admin/tsdb/delete_series?match[]={__name__=~"k6_.*",test_run="baseline-01"}'
```

3. Or delete all k6 runs:

```bash
curl -X POST -g 'http://<home-server-ip>:9090/api/v1/admin/tsdb/delete_series?match[]={__name__=~"k6_.*"}'
```

4. Purge tombstones so space is reclaimed sooner:

```bash
curl -X POST 'http://<home-server-ip>:9090/api/v1/admin/tsdb/clean_tombstones'
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
