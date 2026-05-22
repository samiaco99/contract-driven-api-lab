import './jwt-types.js';
import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { TokenRequestSchema, TokenResponseSchema } from './auth.schema.js';
import { ValidationErrorSchema } from '../schemas/order.schema.js';

export const authRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.post(
    '/token',
    {
      schema: {
        body: TokenRequestSchema,
        response: {
          200: TokenResponseSchema,
          400: ValidationErrorSchema,
        },
      },
    },
    async (request) => {
      const { userId, role } = request.body;
      const token = app.jwt.sign({ sub: userId, role });
      return { token };
    }
  );
};
