/**
 * smoke test = sanity check the API responds correctly under minimal load.
 * If this fails, no point running bigger tests.
 *
 * 1 VU for 30s walks the critical path: health check, auth, list orders.
 * Thresholds are strict because a healthy system should breeze through this.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, ADMIN_CREDS } from '../utils/config.js';
import { getToken } from '../utils/auth.js';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<200'],
  },
};

export default function () {
  const healthRes = http.get(`${BASE_URL}/health/live`);
  check(healthRes, {
    'health/live returns 200': (r) => r.status === 200,
  });

  const token = getToken(ADMIN_CREDS);

  const ordersRes = http.get(`${BASE_URL}/v1/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(ordersRes, {
    'GET /v1/orders returns 200': (r) => r.status === 200,
  });

  sleep(1);
}
