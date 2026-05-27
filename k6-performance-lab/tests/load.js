/**
 * load test — answers: can the API handle expected daily traffic?
 *
 * 20 VUs running for 5 minutes simulates a normal production workload.
 * The traffic mix (80% list, 15% read, 5% create) reflects realistic usage
 * patterns where reads far outnumber writes. A passing run here is the
 * minimum bar before any deployment to a shared environment.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, ADMIN_CREDS } from '../utils/config.js';
import { getToken } from '../utils/auth.js';

export const options = {
  vus: 20,
  duration: '5m',
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
    const payload = JSON.stringify({ userId: ADMIN_CREDS.userId, status: 'PENDING', total: 100 });
    const res = http.post(`${BASE_URL}/v1/orders`, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (res.status !== 201) {
      console.error(`POST /v1/orders failed: status=${res.status} body=${res.body}`);
    }
    check(res, { 'POST /v1/orders returns 201': (r) => r.status === 201 });
  }

  sleep(1);
}
