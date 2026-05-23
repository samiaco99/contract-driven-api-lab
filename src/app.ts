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
import { registerHardening, type HardeningOptions } from './plugins/hardening.js';
import { registerRequestContext } from './plugins/request-context.js';
import { healthPlugin } from './plugins/health.js';
import { registerMethodNotAllowed } from './plugins/method-not-allowed.js';
import { swaggerTransform } from './utils/swagger-transform.js';

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
    transform: swaggerTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  await app.register(healthPlugin, { repository });
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(orderRoutes, { prefix: '/v1', orderService });

  registerMethodNotAllowed(app);

  app.addHook('onClose', async () => {
    if (typeof repository.close === 'function') {
      await repository.close();
    }
  });

  return app;
}
