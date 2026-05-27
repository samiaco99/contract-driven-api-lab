/**
 * spike test — answers: can the API survive a sudden 20x traffic burst without crashing?
 *
 * Jumps from 10 to 200 VUs in 10 seconds, holds for 3 minutes, then drops.
 * This simulates a viral event or flash sale. The interesting signals are:
 *   - Does p95 explode during the spike and then recover during cooldown?
 *   - Do errors appear at the peak but clear after the spike drops?
 *   - Does the API crash (5xx) or just slow down (high p95)?
 * A system that slows but recovers gracefully is healthier than one that errors
 * and requires a restart.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, ADMIN_CREDS } from '../utils/config.js';
import { getToken } from '../utils/auth.js';

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      stages: [
        { target: 10,  duration: '10s' }, // baseline — confirm healthy before spike
        { target: 200, duration: '10s' }, // instant 20x spike
        { target: 200, duration: '3m'  }, // sustained burst
        { target: 0,   duration: '10s' }, // drop — watch for recovery
      ],
    },
  },
  thresholds: {
    // 10% error budget: sudden bursts often cause brief overload while the
    // system (connection pool, JIT, GC) catches up.
    http_req_failed: ['rate<0.10'],
  },
};

function buildHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export function setup() {
  return { token: getToken(ADMIN_CREDS) };
}

export default function ({ token }) {
  // Spike tests focus on a single simple endpoint — avoids write amplification
  // and gives a clean signal on read throughput under sudden load.
  const res = http.get(`${BASE_URL}/v1/orders`, buildHeaders(token));
  check(res, { 'GET /v1/orders returns 200': (r) => r.status === 200 });

  sleep(1);
}
