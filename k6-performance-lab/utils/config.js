/**
 * Shared config for all k6 tests.
 *
 * - BASE_URL: target API root. Override per-run with `k6 run -e BASE_URL=...`
 *   so the same scripts can hit local, staging, or a docker-compose instance.
 * - ADMIN_CREDS / VIEWER_CREDS: seeded users from the API. Admin can mutate
 *   orders; viewer is read-only. Pick the right one per test scenario.
 * - defaultThresholds: baseline pass/fail criteria reused across load tests.
 *   Smoke tests tighten these; stress tests may loosen them.
 */

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const ADMIN_CREDS = { userId: 'alice', password: 'alice-password' };
export const VIEWER_CREDS = { userId: 'bob', password: 'bob-password' };

export const defaultThresholds = {
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<500'],
};
