import { randomBytes } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { SqliteOrderRepository } from '../src/repositories/sqlite-order.repository.js';
import { seedUsers } from '../src/auth/user-store.js';

async function seedOrders(app: FastifyInstance, count: number, token: string) {
  for (let i = 0; i < count; i++) {
    await app.inject({
      method: 'POST',
      url: '/v1/orders',
      payload: { userId: 'alice', status: 'PENDING', total: i + 1 },
      headers: { authorization: `Bearer ${token}` },
    });
  }
}

describe('Cursor-based pagination on GET /v1/orders', () => {
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

  afterEach(async () => {
    await app.close();
  });

  describe('in-memory repository', () => {
    beforeEach(async () => {
      app = await buildApp({ logger: false, jwtSecret: JWT_SECRET });
    });

    it('returns all items with nextCursor null when results fit within limit', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/orders?limit=10',
        headers: { authorization: `Bearer ${viewerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const { data, nextCursor } = res.json();
      expect(data.length).toBeLessThanOrEqual(10);
      expect(nextCursor).toBeNull();
    });

    it('paginates: first page sets nextCursor, second page exhausts results', async () => {
      await seedOrders(app, 4, adminToken); // app starts with 1 seeded -> 5 total

      const page1 = await app.inject({
        method: 'GET',
        url: '/v1/orders?limit=3&cursor=0',
        headers: { authorization: `Bearer ${viewerToken}` },
      });

      expect(page1.statusCode).toBe(200);
      const { data: d1, nextCursor: nc1 } = page1.json();
      expect(d1).toHaveLength(3);
      expect(nc1).toBe(d1[2].id);

      const page2 = await app.inject({
        method: 'GET',
        url: `/v1/orders?limit=3&cursor=${nc1}`,
        headers: { authorization: `Bearer ${viewerToken}` },
      });

      expect(page2.statusCode).toBe(200);
      const { data: d2, nextCursor: nc2 } = page2.json();
      expect(d2).toHaveLength(2);
      expect(nc2).toBeNull();
    });

    it('returns an empty page when cursor is past the last id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/orders?cursor=9999',
        headers: { authorization: `Bearer ${viewerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const { data, nextCursor } = res.json();
      expect(data).toHaveLength(0);
      expect(nextCursor).toBeNull();
    });

    it('keeps cursor pagination stable after deletes create id gaps', async () => {
      await seedOrders(app, 4, adminToken);

      // Create order 2 owned by alice so she can delete it
      const toDelete = await app.inject({
        method: 'GET',
        url: '/v1/orders?limit=5&cursor=0',
        headers: { authorization: `Bearer ${viewerToken}` },
      });
      const allOrders = toDelete.json().data as Array<{ id: number; userId: string }>;
      const aliceOrder = allOrders.find((o) => o.userId === 'alice' && o.id !== allOrders[0].id);
      if (aliceOrder) {
        await app.inject({
          method: 'DELETE',
          url: `/v1/orders/${aliceOrder.id}`,
          headers: { authorization: `Bearer ${adminToken}` },
        });
      }

      const page1 = await app.inject({
        method: 'GET',
        url: '/v1/orders?limit=2&cursor=0',
        headers: { authorization: `Bearer ${viewerToken}` },
      });
      const { data: d1, nextCursor: nc1 } = page1.json();

      const page2 = await app.inject({
        method: 'GET',
        url: `/v1/orders?limit=2&cursor=${nc1}`,
        headers: { authorization: `Bearer ${viewerToken}` },
      });
      const { data: d2, nextCursor: nc2 } = page2.json();

      // All IDs returned are unique and ascending
      const allIds = [...d1, ...d2].map((o: { id: number }) => o.id);
      expect(new Set(allIds).size).toBe(allIds.length);
      expect(allIds).toEqual([...allIds].sort((a, b) => a - b));
      expect(nc2).toBeNull();
    });

    it('returns stable ascending ordering across pages without duplicates', async () => {
      await seedOrders(app, 6, adminToken);

      const seenIds: number[] = [];
      let cursor = 0;

      for (;;) {
        const page = await app.inject({
          method: 'GET',
          url: `/v1/orders?limit=2&cursor=${cursor}`,
          headers: { authorization: `Bearer ${viewerToken}` },
        });
        const { data, nextCursor } = page.json();

        seenIds.push(...data.map((order: { id: number }) => order.id));

        if (nextCursor === null) {
          break;
        }

        cursor = nextCursor;
      }

      expect(seenIds).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(new Set(seenIds).size).toBe(seenIds.length);
    });

    it('rejects limit=0 with 400', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/orders?limit=0',
        headers: { authorization: `Bearer ${viewerToken}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects limit > 100 with 400', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/orders?limit=101',
        headers: { authorization: `Bearer ${viewerToken}` },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('sqlite repository', () => {
    beforeEach(async () => {
      app = await buildApp({
        logger: false,
        jwtSecret: JWT_SECRET,
        repository: new SqliteOrderRepository({ seed: false }),
      });
    });

    it('paginates across multiple pages via SQLite', async () => {
      await seedOrders(app, 5, adminToken);

      const page1 = await app.inject({
        method: 'GET',
        url: '/v1/orders?limit=2&cursor=0',
        headers: { authorization: `Bearer ${viewerToken}` },
      });
      const { data: d1, nextCursor: nc1 } = page1.json();
      expect(d1).toHaveLength(2);
      expect(nc1).toBeGreaterThan(0);

      const page2 = await app.inject({
        method: 'GET',
        url: `/v1/orders?limit=2&cursor=${nc1}`,
        headers: { authorization: `Bearer ${viewerToken}` },
      });
      const { data: d2, nextCursor: nc2 } = page2.json();
      expect(d2).toHaveLength(2);
      expect(nc2).toBeGreaterThan(nc1);

      const page3 = await app.inject({
        method: 'GET',
        url: `/v1/orders?limit=2&cursor=${nc2}`,
        headers: { authorization: `Bearer ${viewerToken}` },
      });
      const { data: d3, nextCursor: nc3 } = page3.json();
      expect(d3).toHaveLength(1);
      expect(nc3).toBeNull();
    });
  });
});
