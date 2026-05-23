import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { parseConfig } from '../src/config.js';
import type { OrderRepository } from '../src/repositories/order.repository.js';
import { SqliteOrderRepository } from '../src/repositories/sqlite-order.repository.js';
import { seedUsers } from '../src/auth/user-store.js';

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

async function close(app: FastifyInstance) {
  await app.close();
}

async function getToken(app: FastifyInstance, userId: 'alice' | 'bob'): Promise<string> {
  const passwords = { alice: 'alice-password', bob: 'bob-password' } as const;
  const res = await app.inject({
    method: 'POST',
    url: '/auth/token',
    payload: { userId, password: passwords[userId] },
  });
  return res.json<{ token: string }>().token;
}

async function exerciseDefaultApp() {
  const app = await buildApp({ logger: false });

  try {
    await app.ready();

    assert.equal(
      (await app.inject({ method: 'GET', url: '/health/live' })).statusCode,
      200
    );
    assert.equal(
      (await app.inject({ method: 'GET', url: '/health/ready' })).statusCode,
      200
    );
    assert.equal(
      (await app.inject({ method: 'GET', url: '/docs/json' })).statusCode,
      200
    );

    const adminToken = await getToken(app, 'alice');
    const viewerToken = await getToken(app, 'bob');
    const adminHeader = { authorization: `Bearer ${adminToken}` };
    const viewerHeader = { authorization: `Bearer ${viewerToken}` };

    const created = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      payload: { userId: 'alice', status: 'PAID', total: 42 },
      headers: adminHeader,
    });
    assert.equal(created.statusCode, 201);
    const order = created.json();

    assert.equal(
      (await app.inject({ method: 'GET', url: `/v1/orders/${order.id}`, headers: adminHeader }))
        .statusCode,
      200
    );
    assert.equal(
      (
        await app.inject({
          method: 'GET',
          url: '/v1/orders?limit=1&cursor=0',
          headers: viewerHeader,
        })
      ).statusCode,
      200
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/orders',
          payload: { userId: 'smoke-admin', status: 'NOPE', total: 1 },
          headers: adminHeader,
        })
      ).statusCode,
      400
    );
    assert.equal(
      (await app.inject({ method: 'GET', url: '/v1/orders/9999', headers: viewerHeader }))
        .statusCode,
      404
    );
    assert.equal(
      (await app.inject({ method: 'DELETE', url: `/v1/orders/${order.id}`, headers: adminHeader }))
        .statusCode,
      204
    );
    // Viewer cannot delete
    assert.equal(
      (await app.inject({ method: 'DELETE', url: '/v1/orders/9999', headers: viewerHeader }))
        .statusCode,
      403
    );
  } finally {
    await close(app);
  }
}

async function exerciseOperationalPaths() {
  const hardened = await buildApp({
    logger: false,
    hardening: {
      corsOrigins: ['https://client.example'],
      rateLimit: { max: 2, windowMs: 60_000 },
    },
  });

  try {
    assert.equal(
      (
        await hardened.inject({
          method: 'OPTIONS',
          url: '/v1/orders',
          headers: {
            origin: 'https://client.example',
            'access-control-request-method': 'POST',
          },
        })
      ).statusCode,
      204
    );

    const token = await getToken(hardened, 'alice');
    const authHeader = { authorization: `Bearer ${token}` };

    assert.equal(
      (await hardened.inject({ method: 'GET', url: '/v1/orders', headers: authHeader })).statusCode,
      200
    );
    assert.equal(
      (await hardened.inject({ method: 'GET', url: '/v1/orders', headers: authHeader })).statusCode,
      429
    );
  } finally {
    await close(hardened);
  }

  const bodyLimited = await buildApp({
    logger: false,
    bodyLimit: 32,
  });

  try {
    assert.equal(
      (
        await bodyLimited.inject({
          method: 'POST',
          url: '/v1/orders',
          payload: {
            userId: 'alice',
            status: 'PENDING',
            total: 1,
            filler: 'this payload is too large',
          },
        })
      ).statusCode,
      413
    );
  } finally {
    await close(bodyLimited);
  }
}

async function exerciseAuth() {
  const app = await buildApp({ logger: false });

  try {
    // seedUsers is idempotent — covers the _seeded early-return branch
    await seedUsers(1);

    // Wrong password → 401 (covers auth.routes.ts 24-30, user-store.ts verifyUser false branch)
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/token',
          payload: { userId: 'alice', password: 'wrong-password' },
        })
      ).statusCode,
      401
    );

    // Unknown user → 401 (covers user-store.ts line 32-34)
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/token',
          payload: { userId: 'nobody', password: 'any-password' },
        })
      ).statusCode,
      401
    );

    // Missing token → 401
    assert.equal(
      (await app.inject({ method: 'GET', url: '/v1/orders' })).statusCode,
      401
    );

    // Valid admin token → 200
    const token = await getToken(app, 'alice');
    assert.equal(
      (
        await app.inject({
          method: 'GET',
          url: '/v1/orders',
          headers: { authorization: `Bearer ${token}` },
        })
      ).statusCode,
      200
    );

    // Viewer cannot POST
    const viewerToken = await getToken(app, 'bob');
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/orders',
          payload: { userId: 'bob', status: 'PENDING', total: 5 },
          headers: { authorization: `Bearer ${viewerToken}` },
        })
      ).statusCode,
      403
    );
  } finally {
    await close(app);
  }
}

async function exerciseReadinessFailure() {
  const app = await buildApp({
    logger: false,
    repository: failingRepository,
  });

  try {
    assert.equal(
      (await app.inject({ method: 'GET', url: '/health/ready' })).statusCode,
      503
    );
  } finally {
    await close(app);
  }
}

async function exerciseSQLite() {
  const app = await buildApp({
    logger: false,
    repository: new SqliteOrderRepository({ seed: true }),
  });

  try {
    const adminToken = await getToken(app, 'alice');
    const adminHeader = { authorization: `Bearer ${adminToken}` };

    const created = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      payload: { userId: 'alice', status: 'CANCELLED', total: 11 },
      headers: adminHeader,
    });
    assert.equal(created.statusCode, 201);
    const order = created.json();

    assert.equal(
      (await app.inject({ method: 'GET', url: '/v1/orders', headers: adminHeader })).statusCode,
      200
    );
    assert.equal(
      (await app.inject({ method: 'GET', url: `/v1/orders/${order.id}`, headers: adminHeader }))
        .statusCode,
      200
    );
    assert.equal(
      (await app.inject({ method: 'DELETE', url: `/v1/orders/${order.id}`, headers: adminHeader }))
        .statusCode,
      204
    );
    assert.equal(
      (await app.inject({ method: 'GET', url: `/v1/orders/${order.id}`, headers: adminHeader }))
        .statusCode,
      404
    );
  } finally {
    await close(app);
  }
}

function exerciseConfig() {
  const jwtSecret = randomBytes(32).toString('hex');
  assert.equal(parseConfig({ JWT_SECRET: jwtSecret }).port, 3000);
  assert.equal(
    parseConfig({
      JWT_SECRET: jwtSecret,
      PORT: '4000',
      CORS_ORIGINS: 'https://a.example, https://b.example',
      RATE_LIMIT_MAX: '5',
      RATE_LIMIT_WINDOW_MS: '1000',
    }).rateLimit.max,
    5
  );
  assert.throws(() => parseConfig({ PORT: '99999' }));
  assert.throws(() => parseConfig({ JWT_SECRET: 'too-short' }));
}

await seedUsers(1);
await exerciseDefaultApp();
await exerciseOperationalPaths();
await exerciseAuth();
await exerciseReadinessFailure();
await exerciseSQLite();
exerciseConfig();
