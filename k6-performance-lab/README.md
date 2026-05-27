# k6 Performance Lab

This lab contains local k6 scripts for checking whether the API is reachable,
functionally valid under traffic, and stable under different load shapes.

The API must be running before any k6 test is executed. By default, the tests
target `http://localhost:3000`; override this with `BASE_URL` if needed.

## Start the API

From the repository root:

```powershell
node --env-file=.env --import tsx src/server.ts
```

## Run Tests

Run the tests through npm scripts:

```powershell
npm run perf:smoke
npm run perf:load
npm run perf:spike
npm run perf:stress
npm run perf:soak
```

On Windows PowerShell, if `npm run ...` fails with an execution policy error for
`npm.ps1`, use the Windows npm shim instead:

```powershell
npm.cmd run perf:smoke
npm.cmd run perf:load
```

Recommended run order:

1. smoke
2. load
3. spike
4. stress
5. soak

## Test Purpose

| Test | Question | Duration |
| --- | --- | --- |
| smoke | Is the API reachable and basically healthy? | ~30s |
| load | Can the API handle expected normal traffic? | ~5m |
| spike | Can the API survive sudden traffic bursts? | ~3.5m |
| stress | Where does the API start to struggle? | ~10m |
| soak | Does the API degrade over time? | ~30m |

## Key Metrics

- `checks_succeeded`: percentage of explicit k6 checks that passed, such as
  expected status codes.
- `http_req_failed`: percentage of HTTP requests k6 classified as failed.
- `http_req_duration`: total request time from k6's perspective.
- `p(95)`: 95th percentile latency; 95% of requests completed at or below this
  value.
- `iterations`: completed executions of the default test function.

## Baseline

Validated local baseline:

- smoke: passed with 100% checks, 0% failures, p95 around 50ms.
- load: passed with 100% checks, 0% failures, p95 around 1-2ms.
- spike: passed at 200 max VUs with 100% checks, 0% failures, p95 around
  0.8ms.

## Troubleshooting

- If k6 shows `status 0` or `No HTTP response was received`, the API is probably
  not running or `BASE_URL` is wrong.
- If auth fails, check the seeded users and `.env`.
- If thresholds fail, inspect whether the failure is functional, such as invalid
  payloads, or actually performance-related.
