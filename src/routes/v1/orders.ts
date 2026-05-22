import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import {
  CreateOrderSchema,
  ErrorResponseSchema,
  OrderParamsSchema,
  OrderSchema,
  PaginatedOrdersSchema,
  PaginationQuerySchema,
  PatchOrderBodySchema,
  ValidationErrorSchema,
} from '../../schemas/order.schema.js';

import { OrderService } from '../../services/order.service.js';
import { authenticate, requireAdmin } from '../../plugins/auth.js';

const bearerAuth = [{ bearerAuth: [] }];

export interface OrderRoutesOptions {
  orderService: OrderService;
}

export const orderRoutes: FastifyPluginAsyncTypebox<OrderRoutesOptions> = async (
  app,
  opts
) => {
  const { orderService } = opts;

  app.addHook('preHandler', authenticate);

  app.get(
    '/orders',
    {
      schema: {
        security: bearerAuth,
        querystring: PaginationQuerySchema,
        response: {
          200: PaginatedOrdersSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      const { limit = 20, cursor = 0 } = request.query;
      return orderService.getOrders({ limit, cursor }, request.log);
    }
  );

  app.get(
    '/orders/:id',
    {
      schema: {
        security: bearerAuth,
        params: OrderParamsSchema,
        response: {
          200: OrderSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      return orderService.getOrderById(request.params.id, request.log);
    }
  );

  app.post(
    '/orders',
    {
      schema: {
        security: bearerAuth,
        body: CreateOrderSchema,
        response: {
          201: OrderSchema,
          400: ValidationErrorSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
      preHandler: requireAdmin,
    },
    async (request, reply) => {
      const order = await orderService.createOrder(request.body, request.log);
      return reply.status(201).send(order);
    }
  );

  app.patch(
    '/orders/:id',
    {
      schema: {
        security: bearerAuth,
        params: OrderParamsSchema,
        body: PatchOrderBodySchema,
        response: {
          200: OrderSchema,
          400: ValidationErrorSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
      preHandler: requireAdmin,
    },
    async (request) => {
      return orderService.updateOrderStatus(
        request.params.id,
        request.body.status,
        request.user.sub,
        request.log
      );
    }
  );

  app.delete(
    '/orders/:id',
    {
      schema: {
        security: bearerAuth,
        params: OrderParamsSchema,
        response: {
          204: {
            type: 'null',
            description: 'Order deleted successfully',
          },
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
      preHandler: requireAdmin,
    },
    async (request, reply) => {
      await orderService.deleteOrderById(
        request.params.id,
        request.user.sub,
        request.log
      );
      return reply.status(204).send(null);
    }
  );
};
