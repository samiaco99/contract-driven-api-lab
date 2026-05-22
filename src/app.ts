import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyServerOptions } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import jwt from '@fastify/jwt';

import './auth/jwt-types.js';
import { InMemoryOrderRepository } from './repositories/in-memory-order.repository.js';
import { OrderRepository } from './repositories/order.repository.js';
import { createOrderService } from './services/order.service.js';
import { registerErrorHandler } from './errors/error-handler.js';
import { orderRoutes } from './routes/v1/orders.js';
import { authRoutes } from './auth/auth.routes.js';
import {
  registerHardening,
  type HardeningOptions,
} from './plugins/hardening.js';
import { registerRequestContext } from './plugins/request-context.js';
import {
  ErrorResponseSchema,
  HealthResponseSchema,
} from './schemas/order.schema.js';

const DEFAULT_BODY_LIMIT_BYTES = 1_048_576; // 1 MiB

export interface BuildAppOptions {
  repository?: OrderRepository;
  logger?: FastifyServerOptions['logger'];
  bodyLimit?: number;
  hardening?: HardeningOptions;
  jwtSecret?: string;
  jwtExpiresIn?: string;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const repository: OrderRepository =
    options.repository ?? new InMemoryOrderRepository({ seed: true });
  const orderService = createOrderService(repository);

  const jwtSecret = options.jwtSecret ?? randomBytes(32).toString('hex');
  const jwtExpiresIn = options.jwtExpiresIn ?? '1h';

  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: options.bodyLimit ?? DEFAULT_BODY_LIMIT_BYTES,
    requestIdHeader: 'x-request-id',
    ajv: {
      customOptions: {
        removeAdditional: false,
      },
    },
  });

  registerRequestContext(app);
  await registerHardening(app, options.hardening);
  registerErrorHandler(app);

  await app.register(jwt, {
    secret: jwtSecret,
    sign: { expiresIn: jwtExpiresIn },
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Contract Driven API Lab',
        description:
          'A small Fastify API focused on schemas, validation, and contract-driven development.',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  app.get(
    '/health/live',
    {
      schema: {
        response: {
          200: HealthResponseSchema,
        },
      },
    },
    async () => {
      return { status: 'ok' };
    }
  );

  app.get(
    '/health/ready',
    {
      schema: {
        response: {
          200: HealthResponseSchema,
          503: ErrorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      try {
        await repository.ping();
        return { status: 'ok' };
      } catch {
        return reply.status(503).send({
          statusCode: 503,
          error: 'Service Unavailable',
          message: 'Database ping failed',
          requestId: _request.id,
        });
      }
    }
  );

  await app.register(authRoutes, { prefix: '/auth' });

  await app.register(orderRoutes, {
    prefix: '/v1',
    orderService,
  });

  app.addHook('onClose', async () => {
    if (typeof repository.close === 'function') {
      await repository.close();
    }
  });

  return app;
}
