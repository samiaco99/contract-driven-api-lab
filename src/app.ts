import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyServerOptions } from 'fastify';
import buildAjvCompiler from '@fastify/ajv-compiler';
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

// Two AJV instances: body uses coerceTypes:false (null must not coerce to 0),
// everything else (querystring, params) keeps coerceTypes:'array' for string→int coercion.
const _ajvBase = { useDefaults: true, removeAdditional: false, addUsedSchema: false, allErrors: false } as const;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _bodyCompile = (buildAjvCompiler as any)()({}, { customOptions: { ..._ajvBase, coerceTypes: false } }) as (opts: { schema: unknown }) => (data: unknown) => boolean;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _otherCompile = (buildAjvCompiler as any)()({}, { customOptions: { ..._ajvBase, coerceTypes: 'array' } }) as (opts: { schema: unknown }) => (data: unknown) => boolean;

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
  });

  app.setValidatorCompiler(({ schema, httpPart }) =>
    httpPart === 'body' ? _bodyCompile({ schema }) : _otherCompile({ schema })
  );

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

  app.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split('?')[0];
    const knownMethods = ['DELETE', 'GET', 'HEAD', 'PATCH', 'POST', 'PUT'] as const;

    // hasRoute matches exact patterns only; for concrete URLs that hit a parameterized
    // route (e.g. /v1/orders/1 vs /v1/orders/:id), retry with the trailing numeric
    // segment replaced by :id so we can still detect a 405 vs 404 situation.
    const routeExists = (method: (typeof knownMethods)[number], url: string): boolean => {
      if (app.hasRoute({ method, url })) return true;
      const segs = url.split('/');
      const last = segs[segs.length - 1] ?? '';
      if (segs.length > 1 && /^\d+$/.test(last)) {
        return app.hasRoute({ method, url: segs.slice(0, -1).join('/') + '/:id' });
      }
      return false;
    };

    const allowedMethods = knownMethods.filter(m => routeExists(m, pathname));

    if (allowedMethods.length > 0) {
      return reply
        .status(405)
        .header('Allow', allowedMethods.join(', '))
        .send({
          statusCode: 405,
          error: 'Method Not Allowed',
          message: `Method ${request.method} is not allowed for this route`,
          requestId: request.id,
        });
    }

    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${request.method}:${request.url} not found`,
      requestId: request.id,
    });
  });

  app.addHook('onClose', async () => {
    if (typeof repository.close === 'function') {
      await repository.close();
    }
  });

  return app;
}
