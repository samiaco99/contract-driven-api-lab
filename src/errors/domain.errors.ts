export class OrderNotFoundError extends Error {
  readonly id: number;

  constructor(id: number) {
    super(`Order with id ${id} was not found`);
    this.name = 'OrderNotFoundError';
    this.id = id;
  }
}

export class OrderConflictError extends Error {
  readonly currentStatus: string;
  readonly requestedStatus: string;

  constructor(currentStatus: string, requestedStatus: string) {
    super(`Cannot transition order from ${currentStatus} to ${requestedStatus}`);
    this.name = 'OrderConflictError';
    this.currentStatus = currentStatus;
    this.requestedStatus = requestedStatus;
  }
}

export class OrderForbiddenError extends Error {
  readonly id: number;

  constructor(id: number) {
    super(`Not authorized to modify order ${id}`);
    this.name = 'OrderForbiddenError';
    this.id = id;
  }
}
