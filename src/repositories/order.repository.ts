import type {
  CreateOrderInput,
  Order,
  OrderStatus,
  PaginatedOrders,
} from '../schemas/order.schema.js';

export interface PaginationOptions {
  limit: number;
  cursor: number;
}

export interface RepoLogger {
  debug(obj: object, msg?: string): void;
}

export interface OrderRepository {
  findAll(opts?: PaginationOptions, log?: RepoLogger): Promise<PaginatedOrders>;
  findById(id: number, log?: RepoLogger): Promise<Order | undefined>;
  create(data: CreateOrderInput, log?: RepoLogger): Promise<Order>;
  updateStatus(id: number, status: OrderStatus, log?: RepoLogger): Promise<Order>;
  deleteById(id: number, log?: RepoLogger): Promise<boolean>;
  ping(): Promise<void>;
  close?(): Promise<void>;
}
