import http from 'k6/http';
import { BASE_URL } from './config.js';

/**
 * Every authenticated test needs a JWT, and the auth flow never changes —
 * so we centralize it here. A bad token would surface as cascading 401s on
 * every protected request and make the real failure hard to spot. Throwing
 * loudly here makes auth failures fail-fast and obvious.
 */
export function getToken(credentials) {
  const res = http.post(
    `${BASE_URL}/auth/token`,
    JSON.stringify(credentials),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (res.status !== 200) {
    const connectionHint =
      res.status === 0
        ? ' No HTTP response was received; check that the API is running and BASE_URL is reachable.'
        : '';

    throw new Error(
      `Auth failed for userId="${credentials.userId}": expected 200, got ${res.status}. Body: ${res.body}.${connectionHint}`,
    );
  }

  const body = res.json();
  if (!body || !body.token) {
    throw new Error(`Auth response missing token field. Body: ${res.body}`);
  }

  return body.token;
}
