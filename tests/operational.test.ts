import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import type { OrderRepository } from '../src/repositories/order.repository.js';

const failingRepository: OrderRepository = {
  async findAll() {
    return { data: [], nextCursor: null };
  },
  async findById() {
    return undefined;
  },
  async create() {
    throw new Error('not implemented');
  },
  async updateStatus() {
    throw new Error('not implemented');
  },
  async deleteById() {
    return false;
  },
  async ping() {
    throw new Error('database unavailable');
  },
};

describe('Operational hardening', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('propagates request ids to headers and domain error bodies', async () => {
    const jwtSecret = randomBytes(32).toString('hex');
    app = await buildApp({ logger: false, jwtSecret });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/orders/999',
      headers: {
        'x-request-id': 'test-request-id',
      },
    });

    // 401 because no token, but request-id still propagated
    expect(response.headers['x-request-id']).toBe('test-request-id');
    expect(response.json()).toMatchObject({
      requestId: 'test-request-id',
    });
  });

  it('adds security headers', async () => {
    app = await buildApp({ logger: false });

    const response = await app.inject({ method: 'GET', url: '/health/live' });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });

  it('handles allowed CORS preflight requests', async () => {
    app = await buildApp({
      logger: false,
      hardening: {
        corsOrigins: ['https://client.example'],
      },
    });

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/orders',
      headers: {
        origin: 'https://client.example',
        'access-control-request-method': 'POST',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://client.example'
    );
  });

  it('blocks requests from an unknown origin', async () => {
    app = await buildApp({
      logger: false,
      hardening: {
        corsOrigins: ['https://client.example'],
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/orders',
      headers: {
        origin: 'https://evil.example',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rate limits excessive requests on application routes', async () => {
    const jwtSecret = randomBytes(32).toString('hex');
    app = await buildApp({
      logger: false,
      jwtSecret,
      hardening: {
        rateLimit: {
          // max: 2 because the /auth/token fetch is now counted against the limit
          max: 2,
          windowMs: 60_000,
        },
      },
    });

    const { token } = (
      await app.inject({
        method: 'POST',
        url: '/auth/token',
        payload: { userId: 'alice', password: 'alice-password' },
      })
    ).json<{ token: string }>();
    const authHeader = { authorization: `Bearer ${token}` };

    const ok = await app.inject({ method: 'GET', url: '/v1/orders', headers: authHeader });
    expect(ok.statusCode).toBe(200);

    const limited = await app.inject({ method: 'GET', url: '/v1/orders', headers: authHeader });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({
      statusCode: 429,
      error: 'Too Many Requests',
      requestId: expect.any(String),
    });
  });

  it('bypasses rate limiting for health and docs endpoints', async () => {
    app = await buildApp({
      logger: false,
      hardening: {
        rateLimit: {
          max: 1,
          windowMs: 60_000,
        },
      },
    });

    const live1 = await app.inject({ method: 'GET', url: '/health/live' });
    const live2 = await app.inject({ method: 'GET', url: '/health/live' });
    const ready1 = await app.inject({ method: 'GET', url: '/health/ready' });
    const ready2 = await app.inject({ method: 'GET', url: '/health/ready' });
    const docs = await app.inject({ method: 'GET', url: '/docs/json' });

    expect(live1.statusCode).toBe(200);
    expect(live2.statusCode).toBe(200);
    expect(ready1.statusCode).toBe(200);
    expect(ready2.statusCode).toBe(200);
    expect(docs.statusCode).toBe(200);
  });

  it('can disable rate limiting for test and CI runs', async () => {
    const jwtSecret = randomBytes(32).toString('hex');
    app = await buildApp({
      logger: false,
      jwtSecret,
      hardening: {
        rateLimit: false,
      },
    });

    const { token } = (
      await app.inject({
        method: 'POST',
        url: '/auth/token',
        payload: { userId: 'alice', password: 'alice-password' },
      })
    ).json<{ token: string }>();
    const authHeader = { authorization: `Bearer ${token}` };

    const first = await app.inject({ method: 'GET', url: '/v1/orders', headers: authHeader });
    const second = await app.inject({ method: 'GET', url: '/v1/orders', headers: authHeader });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
  });

  it('returns 503 when readiness dependency checks fail', async () => {
    app = await buildApp({
      logger: false,
      repository: failingRepository,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'Database ping failed',
      requestId: expect.any(String),
    });
  });

  it('enforces the configured body size limit', async () => {
    const jwtSecret = randomBytes(32).toString('hex');
    app = await buildApp({ logger: false, jwtSecret, bodyLimit: 32 });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      payload: {
        userId: 'x',
        status: 'PENDING',
        total: 100,
        filler: 'this body is intentionally too large',
      },
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({
      statusCode: 413,
      requestId: expect.any(String),
    });
  });
});
