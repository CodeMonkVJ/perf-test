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
- Grafana: `http://<home-server-ip>:3000` (default `admin/admin`)
- cAdvisor: `http://<home-server-ip>:8080`

In Grafana, add Prometheus datasource URL: `http://prometheus:9090`.

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
