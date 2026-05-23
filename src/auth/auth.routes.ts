import './jwt-types.js';
import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { TokenRequestSchema, TokenResponseSchema } from './auth.schema.js';
import { ErrorResponseSchema, ValidationErrorSchema } from '../schemas/order.schema.js';
import { verifyUser } from './user-store.js';

export const authRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.post(
    '/token',
    {
      schema: {
        body: TokenRequestSchema,
        response: {
          200: TokenResponseSchema,
          400: ValidationErrorSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId, password } = request.body;
      const role = await verifyUser(userId, password);
      if (!role) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid credentials',
          requestId: request.id,
        });
      }
      const token = app.jwt.sign({ sub: userId, role });
      return { token };
    }
  );
};
