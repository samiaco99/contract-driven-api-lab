import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';

describe('JWT authentication', () => {
  const JWT_SECRET = randomBytes(32).toString('hex');
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false, jwtSecret: JWT_SECRET });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/token', () => {
    it('returns 200 with a token for a valid admin request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/token',
        payload: { userId: 'alice', role: 'admin' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(typeof body.token).toBe('string');
      expect(body.token.split('.').length).toBe(3); // valid JWT structure
    });

    it('returns 200 with a token for a valid viewer request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/token',
        payload: { userId: 'bob', role: 'viewer' },
      });

      expect(response.statusCode).toBe(200);
      expect(typeof response.json().token).toBe('string');
    });

    it('returns 400 when userId is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/token',
        payload: { role: 'admin' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when role is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/token',
        payload: { userId: 'alice' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when role is not a valid enum value', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/token',
        payload: { userId: 'alice', role: 'superadmin' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when extra fields are sent', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/token',
        payload: { userId: 'alice', role: 'admin', sneaky: 'value' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('token verification on /v1 routes', () => {
    it('returns 401 with "Unauthorized" for a missing token', async () => {
      const response = await app.inject({ method: 'GET', url: '/v1/orders' });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Unauthorized',
        requestId: expect.any(String),
      });
    });

    it('returns 401 with "Unauthorized" for an invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/orders',
        headers: { authorization: 'Bearer not.a.valid.token' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Unauthorized',
      });
    });

    it('returns 401 with "Token expired" for an expired token', async () => {
      // Sign a token that is already expired
      const expiredToken = app.jwt.sign(
        { sub: 'alice', role: 'admin' as const },
        { expiresIn: -10 }
      );

      const response = await app.inject({
        method: 'GET',
        url: '/v1/orders',
        headers: { authorization: `Bearer ${expiredToken}` },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Token expired',
      });
    });

    it('returns 200 for a valid token', async () => {
      const { token } = (
        await app.inject({
          method: 'POST',
          url: '/auth/token',
          payload: { userId: 'alice', role: 'admin' },
        })
      ).json<{ token: string }>();

      const response = await app.inject({
        method: 'GET',
        url: '/v1/orders',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('health and docs endpoints do not require a token', async () => {
      const live = await app.inject({ method: 'GET', url: '/health/live' });
      const ready = await app.inject({ method: 'GET', url: '/health/ready' });
      const docs = await app.inject({ method: 'GET', url: '/docs/json' });

      expect(live.statusCode).toBe(200);
      expect(ready.statusCode).toBe(200);
      expect(docs.statusCode).toBe(200);
    });
  });

  describe('role-based access', () => {
    it('admin can POST /v1/orders', async () => {
      const { token } = (
        await app.inject({
          method: 'POST',
          url: '/auth/token',
          payload: { userId: 'alice', role: 'admin' },
        })
      ).json<{ token: string }>();

      const response = await app.inject({
        method: 'POST',
        url: '/v1/orders',
        payload: { userId: 'alice', status: 'PENDING', total: 50 },
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(201);
    });

    it('viewer cannot POST /v1/orders → 403', async () => {
      const { token } = (
        await app.inject({
          method: 'POST',
          url: '/auth/token',
          payload: { userId: 'bob', role: 'viewer' },
        })
      ).json<{ token: string }>();

      const response = await app.inject({
        method: 'POST',
        url: '/v1/orders',
        payload: { userId: 'bob', status: 'PENDING', total: 50 },
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        statusCode: 403,
        error: 'Forbidden',
        requestId: expect.any(String),
      });
    });

    it('viewer cannot PATCH /v1/orders/:id → 403', async () => {
      const { token } = (
        await app.inject({
          method: 'POST',
          url: '/auth/token',
          payload: { userId: 'bob', role: 'viewer' },
        })
      ).json<{ token: string }>();

      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/orders/1',
        payload: { status: 'PAID' },
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('viewer cannot DELETE /v1/orders/:id → 403', async () => {
      const { token } = (
        await app.inject({
          method: 'POST',
          url: '/auth/token',
          payload: { userId: 'bob', role: 'viewer' },
        })
      ).json<{ token: string }>();

      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/orders/1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
