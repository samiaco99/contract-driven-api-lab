import { randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { InMemoryOrderRepository } from '../src/repositories/in-memory-order.repository.js';
import { seedUsers } from '../src/auth/user-store.js';

describe('Orders API (in-memory)', () => {
  const JWT_SECRET = randomBytes(32).toString('hex');
  let adminToken: string;
  let viewerToken: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    await seedUsers(1);
    const issuer = await buildApp({ logger: false, jwtSecret: JWT_SECRET });
    adminToken = (
      await issuer.inject({
        method: 'POST',
        url: '/auth/token',
        payload: { userId: 'alice', password: 'alice-password' },
      })
    ).json<{ token: string }>().token;
    viewerToken = (
      await issuer.inject({
        method: 'POST',
        url: '/auth/token',
        payload: { userId: 'bob', password: 'bob-password' },
      })
    ).json<{ token: string }>().token;
    await issuer.close();
  });

  beforeEach(async () => {
    app = await buildApp({
      logger: false,
      jwtSecret: JWT_SECRET,
      repository: new InMemoryOrderRepository({ seed: true }),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const adminAuth = () => ({ authorization: `Bearer ${adminToken}` });
  const viewerAuth = () => ({ authorization: `Bearer ${viewerToken}` });

  it('should create an order', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      payload: { userId: 'alice', status: 'PENDING', total: 100 },
      headers: adminAuth(),
    });

    expect(response.statusCode).toBe(201);

    const body = response.json();
    expect(body.userId).toBe('alice');
    expect(body.status).toBe('PENDING');
    expect(body.total).toBe(100);
    expect(typeof body.id).toBe('number');
  });

  it('should reject invalid order status with a documented validation error', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      payload: { userId: 'alice', status: 'ERROR', total: 100 },
      headers: adminAuth(),
    });

    expect(response.statusCode).toBe(400);

    const body = response.json();
    expect(body).toMatchObject({
      statusCode: 400,
      code: expect.any(String),
      error: expect.any(String),
      message: expect.any(String),
    });
  });

  it('should reject extra unknown fields in the body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      payload: { userId: 'alice', status: 'PENDING', total: 50, sneaky: 'value' },
      headers: adminAuth(),
    });

    expect(response.statusCode).toBe(400);
  });

  it('should get an existing order by id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/orders/1',
      headers: viewerAuth(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(1);
  });

  it('should return 404 for a missing order with the documented error shape', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/orders/999',
      headers: viewerAuth(),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      message: expect.stringContaining('999'),
    });
  });

  it('should reject non-integer ids in the URL', async () => {
    const nonNumeric = await app.inject({
      method: 'GET',
      url: '/v1/orders/abc',
      headers: viewerAuth(),
    });

    const fractional = await app.inject({
      method: 'GET',
      url: '/v1/orders/1.5',
      headers: viewerAuth(),
    });

    expect(nonNumeric.statusCode).toBe(400);
    expect(fractional.statusCode).toBe(400);
  });

  it('admin can delete their own order', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      payload: { userId: 'alice', status: 'PENDING', total: 50 },
      headers: adminAuth(),
    });
    const { id } = created.json<{ id: number }>();

    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/orders/${id}`,
      headers: adminAuth(),
    });

    expect(response.statusCode).toBe(204);
  });

  it('returns 404 after deleting an order', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      payload: { userId: 'alice', status: 'PENDING', total: 50 },
      headers: adminAuth(),
    });
    const { id } = created.json<{ id: number }>();

    await app.inject({ method: 'DELETE', url: `/v1/orders/${id}`, headers: adminAuth() });

    const response = await app.inject({
      method: 'GET',
      url: `/v1/orders/${id}`,
      headers: adminAuth(),
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 404 when deleting a non-existent order', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/v1/orders/999',
      headers: adminAuth(),
    });

    expect(response.statusCode).toBe(404);
  });

  it('admin cannot delete another user\'s order → 403', async () => {
    // seeded order belongs to 'system', alice is 'admin' with sub='alice'
    const response = await app.inject({
      method: 'DELETE',
      url: '/v1/orders/1',
      headers: adminAuth(),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      statusCode: 403,
      error: 'Forbidden',
      requestId: expect.any(String),
    });
  });

  it('viewer trying DELETE → 403', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/v1/orders/1',
      headers: viewerAuth(),
    });

    expect(response.statusCode).toBe(403);
  });

  it('viewer trying POST → 403', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      payload: { userId: 'bob', status: 'PENDING', total: 10 },
      headers: viewerAuth(),
    });

    expect(response.statusCode).toBe(403);
  });

  describe('PATCH /v1/orders/:id', () => {
    it('returns 200 with updated order on a valid transition', async () => {
      // Create an order owned by alice
      const created = await app.inject({
        method: 'POST',
        url: '/v1/orders',
        payload: { userId: 'alice', status: 'PENDING', total: 50 },
        headers: adminAuth(),
      });
      const { id } = created.json<{ id: number }>();

      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/orders/${id}`,
        payload: { status: 'PAID' },
        headers: adminAuth(),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ id, status: 'PAID' });
    });

    it('returns 409 on an invalid transition (CANCELLED → PAID)', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/v1/orders',
        payload: { userId: 'alice', status: 'PENDING', total: 50 },
        headers: adminAuth(),
      });
      const { id } = created.json<{ id: number }>();

      await app.inject({
        method: 'PATCH',
        url: `/v1/orders/${id}`,
        payload: { status: 'CANCELLED' },
        headers: adminAuth(),
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/orders/${id}`,
        payload: { status: 'PAID' },
        headers: adminAuth(),
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        statusCode: 409,
        error: 'Conflict',
        requestId: expect.any(String),
      });
    });

    it('returns 404 for an unknown order id', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/orders/999',
        payload: { status: 'PAID' },
        headers: adminAuth(),
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 400 for an invalid status value', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/orders/1',
        payload: { status: 'REFUNDED' },
        headers: adminAuth(),
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 403 when admin tries to PATCH another user\'s order', async () => {
      // seeded order 1 belongs to 'system'
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/orders/1',
        payload: { status: 'PAID' },
        headers: adminAuth(),
      });

      expect(response.statusCode).toBe(403);
    });

    it('viewer trying PATCH → 403', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/orders/1',
        payload: { status: 'PAID' },
        headers: viewerAuth(),
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
