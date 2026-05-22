import { randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { SqliteOrderRepository } from '../src/repositories/sqlite-order.repository.js';

describe('Orders API (sqlite)', () => {
  const JWT_SECRET = randomBytes(32).toString('hex');
  let adminToken: string;
  let viewerToken: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    const issuer = await buildApp({ logger: false, jwtSecret: JWT_SECRET });
    adminToken = (
      await issuer.inject({
        method: 'POST',
        url: '/auth/token',
        payload: { userId: 'alice', role: 'admin' },
      })
    ).json<{ token: string }>().token;
    viewerToken = (
      await issuer.inject({
        method: 'POST',
        url: '/auth/token',
        payload: { userId: 'bob', role: 'viewer' },
      })
    ).json<{ token: string }>().token;
    await issuer.close();
  });

  beforeEach(async () => {
    const repository = new SqliteOrderRepository({ seed: true });
    app = await buildApp({ logger: false, jwtSecret: JWT_SECRET, repository });
  });

  afterEach(async () => {
    await app.close();
  });

  const adminAuth = () => ({ authorization: `Bearer ${adminToken}` });
  const viewerAuth = () => ({ authorization: `Bearer ${viewerToken}` });

  it('should round-trip an order through SQLite', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      payload: { userId: 'alice', status: 'PAID', total: 250 },
      headers: adminAuth(),
    });

    expect(create.statusCode).toBe(201);
    const created = create.json();
    expect(created.userId).toBe('alice');
    expect(created.status).toBe('PAID');
    expect(created.total).toBe(250);

    const fetched = await app.inject({
      method: 'GET',
      url: `/v1/orders/${created.id}`,
      headers: viewerAuth(),
    });

    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toEqual(created);
  });

  it('should list both the seeded order and a newly created one', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/orders',
      payload: { userId: 'alice', status: 'CANCELLED', total: 10 },
      headers: adminAuth(),
    });

    const list = await app.inject({
      method: 'GET',
      url: '/v1/orders',
      headers: viewerAuth(),
    });

    expect(list.statusCode).toBe(200);
    const { data, nextCursor } = list.json();
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ status: 'PENDING' });
    expect(nextCursor).toBeNull();
  });

  it('admin can delete their own order and 404 on the next read', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      payload: { userId: 'alice', status: 'PENDING', total: 50 },
      headers: adminAuth(),
    });
    const { id } = created.json<{ id: number }>();

    const del = await app.inject({
      method: 'DELETE',
      url: `/v1/orders/${id}`,
      headers: adminAuth(),
    });
    expect(del.statusCode).toBe(204);

    const fetched = await app.inject({
      method: 'GET',
      url: `/v1/orders/${id}`,
      headers: viewerAuth(),
    });
    expect(fetched.statusCode).toBe(404);
  });

  it('admin cannot delete another user\'s order → 403', async () => {
    // seeded order 1 belongs to 'system', alice cannot delete it
    const del = await app.inject({
      method: 'DELETE',
      url: '/v1/orders/1',
      headers: adminAuth(),
    });
    expect(del.statusCode).toBe(403);
  });

  it('viewer trying DELETE → 403', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/v1/orders/1',
      headers: viewerAuth(),
    });
    expect(response.statusCode).toBe(403);
  });

  describe('PATCH /v1/orders/:id', () => {
    it('returns 200 with updated order on a valid transition via SQLite', async () => {
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

    it('returns 409 on an invalid transition (PAID → PENDING) via SQLite', async () => {
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
        payload: { status: 'PAID' },
        headers: adminAuth(),
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/orders/${id}`,
        payload: { status: 'PENDING' },
        headers: adminAuth(),
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ statusCode: 409, error: 'Conflict' });
    });

    it('returns 404 for an unknown order id via SQLite', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/orders/999',
        payload: { status: 'PAID' },
        headers: adminAuth(),
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 403 when patching another user\'s order via SQLite', async () => {
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
