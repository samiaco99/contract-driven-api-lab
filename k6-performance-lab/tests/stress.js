/**
 * stress test — answers: where does the API start to struggle?
 *
 * Ramps VUs progressively beyond normal load to find the point where errors
 * appear or latency spikes dramatically. Thresholds are intentionally loose —
 * the goal is to observe degradation, not pass a binary check. Watch the live
 * output: the VU count where p95 first breaks 500ms or errors exceed 1% is
 * your soft limit. The VU count where the API stops recovering is your hard limit.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, ADMIN_CREDS } from '../utils/config.js';
import { getToken } from '../utils/auth.js';

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      stages: [
        { target: 20,  duration: '2m' }, // warmup — same as load test baseline
        { target: 50,  duration: '3m' }, // above normal load
        { target: 100, duration: '3m' }, // heavy load
        { target: 0,   duration: '2m' }, // cooldown
      ],
    },
  },
  thresholds: {
    // Permissive: we expect some failures under extreme load, the point is
    // to find where things break, not to enforce a pass/fail boundary here.
    http_req_failed: ['rate<0.20'],
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
    const payload = JSON.stringify({ item: 'stress-test-item', quantity: 1 });
    const res = http.post(`${BASE_URL}/v1/orders`, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    check(res, { 'POST /v1/orders returns 201': (r) => r.status === 201 });
  }

  sleep(1);
}
