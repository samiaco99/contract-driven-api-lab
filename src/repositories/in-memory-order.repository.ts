import type {
  CreateOrderInput,
  Order,
  OrderStatus,
  PaginatedOrders,
} from '../schemas/order.schema.js';
import { type PaginationOptions, type RepoLogger, OrderRepository } from './order.repository.js';

export interface InMemoryOrderRepositoryOptions {
  seed?: boolean;
}

export class InMemoryOrderRepository implements OrderRepository {
  private orders: Order[];
  private nextId: number;

  constructor(options: InMemoryOrderRepositoryOptions = {}) {
    if (options.seed) {
      this.orders = [{ id: 1, userId: 'system', status: 'PENDING', total: 120 }];
      this.nextId = 2;
    } else {
      this.orders = [];
      this.nextId = 1;
    }
  }

  async findAll(
    opts: PaginationOptions = { limit: 20, cursor: 0 },
    log?: RepoLogger
  ): Promise<PaginatedOrders> {
    log?.debug({ opts }, 'findAll called');
    const { limit, cursor } = opts;
    const filtered = this.orders
      .filter((order) => order.id > cursor)
      .sort((a, b) => a.id - b.id);
    const hasMore = filtered.length > limit;
    const data = hasMore ? filtered.slice(0, limit) : filtered;

    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  async findById(id: number, log?: RepoLogger): Promise<Order | undefined> {
    log?.debug({ id }, 'findById called');
    return this.orders.find((order) => order.id === id);
  }

  async create(data: CreateOrderInput, log?: RepoLogger): Promise<Order> {
    log?.debug({ status: data.status, total: data.total }, 'create called');
    const order: Order = { id: this.nextId, ...data };

    this.nextId += 1;
    this.orders.push(order);

    return order;
  }

  async updateStatus(
    id: number,
    status: OrderStatus,
    log?: RepoLogger
  ): Promise<Order> {
    log?.debug({ id, status }, 'updateStatus called');
    const order = this.orders.find((o) => o.id === id);
    if (!order) throw new Error(`Order ${id} not found`);
    order.status = status;
    return { ...order };
  }

  async ping(): Promise<void> {}

  async deleteById(id: number, log?: RepoLogger): Promise<boolean> {
    log?.debug({ id }, 'deleteById called');
    const index = this.orders.findIndex((order) => order.id === id);

    if (index === -1) {
      return false;
    }

    this.orders.splice(index, 1);

    return true;
  }
}
