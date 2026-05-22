import type { FastifyBaseLogger } from 'fastify';
import type {
  CreateOrderInput,
  Order,
  OrderStatus,
  PaginatedOrders,
} from '../schemas/order.schema.js';
import {
  OrderConflictError,
  OrderForbiddenError,
  OrderNotFoundError,
} from '../errors/domain.errors.js';
import { type PaginationOptions, OrderRepository } from '../repositories/order.repository.js';

const ALLOWED_TRANSITIONS: Partial<Record<OrderStatus, Set<OrderStatus>>> = {
  PENDING: new Set(['PAID', 'CANCELLED']),
  PAID: new Set(['CANCELLED']),
};

export interface OrderService {
  getOrders(
    opts?: PaginationOptions,
    log?: FastifyBaseLogger
  ): Promise<PaginatedOrders>;
  getOrderById(id: number, log?: FastifyBaseLogger): Promise<Order>;
  createOrder(data: CreateOrderInput, log?: FastifyBaseLogger): Promise<Order>;
  updateOrderStatus(
    id: number,
    newStatus: OrderStatus,
    callerId: string,
    log?: FastifyBaseLogger
  ): Promise<Order>;
  deleteOrderById(
    id: number,
    callerId: string,
    log?: FastifyBaseLogger
  ): Promise<void>;
}

export function createOrderService(
  repository: OrderRepository,
  defaultLog?: FastifyBaseLogger
): OrderService {
  return {
    async getOrders(opts = { limit: 20, cursor: 0 }, log) {
      const requestLog = log ?? defaultLog;
      return repository.findAll(opts, requestLog);
    },

    async getOrderById(id, log) {
      const requestLog = log ?? defaultLog;
      const order = await repository.findById(id, requestLog);

      if (!order) {
        throw new OrderNotFoundError(id);
      }

      return order;
    },

    async createOrder(data, log) {
      const requestLog = log ?? defaultLog;
      return repository.create(data, requestLog);
    },

    async updateOrderStatus(id, newStatus, callerId, log) {
      const requestLog = log ?? defaultLog;
      requestLog?.info({ id, newStatus }, 'updateOrderStatus called');

      const order = await repository.findById(id, requestLog);
      if (!order) throw new OrderNotFoundError(id);
      if (order.userId !== callerId) throw new OrderForbiddenError(id);
      if (!ALLOWED_TRANSITIONS[order.status]?.has(newStatus)) {
        throw new OrderConflictError(order.status, newStatus);
      }
      return repository.updateStatus(id, newStatus, requestLog);
    },

    async deleteOrderById(id, callerId, log) {
      const requestLog = log ?? defaultLog;
      const order = await repository.findById(id, requestLog);
      if (!order) throw new OrderNotFoundError(id);
      if (order.userId !== callerId) throw new OrderForbiddenError(id);
      await repository.deleteById(id, requestLog);
    },
  };
}
