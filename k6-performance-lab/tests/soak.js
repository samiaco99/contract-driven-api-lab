/**
 * soak test — answers: does the API degrade over time under sustained load?
 *
 * Runs 20 VUs for 30 minutes at a gentle pace (sleep(2) between requests).
 * Real soak tests run for 4-8 hours; 30 minutes catches the most obvious leaks.
 * What to watch for:
 *   - p95 creeping upward over time (memory pressure, connection pool growth)
 *   - Errors appearing only in the last 10 minutes (exhaustion, not startup noise)
 *   - Node.js heap growing without GC recovery (visible in process metrics if
 *     you instrument with --out influxdb or similar)
 * If the API looks fine after 30m, extend the duration and re-run.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, ADMIN_CREDS } from '../utils/config.js';
import { getToken } from '../utils/auth.js';

export const options = {
  vus: 20,
  duration: '30m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

function buildHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export function setup() {
  return { token: getToken(ADMIN_CREDS) };
}

export default function ({ token }) {
  const roll = Math.random();

  if (roll < 0.80) {
    const res = http.get(`${BASE_URL}/v1/orders`, buildHeaders(token));
    check(res, { 'GET /v1/orders returns 200': (r) => r.status === 200 });
  } else if (roll < 0.95) {
    const res = http.get(`${BASE_URL}/v1/orders/1`, buildHeaders(token));
    check(res, { 'GET /v1/orders/:id returns 200 or 404': (r) => r.status === 200 || r.status === 404 });
  } else {
    const payload = JSON.stringify({ item: 'soak-test-item', quantity: 1 });
    const res = http.post(`${BASE_URL}/v1/orders`, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    check(res, { 'POST /v1/orders returns 201': (r) => r.status === 201 });
  }

  // Lower request rate than load.js — the point is duration, not throughput.
  sleep(2);
}
