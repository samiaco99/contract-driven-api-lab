import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { OrderRepository } from '../repositories/order.repository.js';
import { ErrorResponseSchema, HealthResponseSchema } from '../schemas/order.schema.js';

export interface HealthPluginOptions {
  repository: OrderRepository;
}

export const healthPlugin: FastifyPluginAsyncTypebox<HealthPluginOptions> = async (app, opts) => {
  const { repository } = opts;

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
      return { status: 'ok' as const };
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
    async (request, reply) => {
      try {
        await repository.ping();
        return { status: 'ok' as const };
      } catch {
        return reply.status(503).send({
          statusCode: 503,
          error: 'Service Unavailable',
          message: 'Database ping failed',
          requestId: request.id,
        });
      }
    }
  );
};
