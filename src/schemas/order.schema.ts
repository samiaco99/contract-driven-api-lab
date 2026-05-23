import { Type, Static } from '@sinclair/typebox';

export const ORDER_STATUSES = ['PENDING', 'PAID', 'CANCELLED'] as const;

const orderStatusLiteralSchemas = ORDER_STATUSES.map((status) =>
  Type.Literal(status)
) as [
  ReturnType<typeof Type.Literal<'PENDING'>>,
  ReturnType<typeof Type.Literal<'PAID'>>,
  ReturnType<typeof Type.Literal<'CANCELLED'>>,
];

export const OrderStatusSchema = Type.Union(orderStatusLiteralSchemas);
export type OrderStatus = Static<typeof OrderStatusSchema>;

export const OrderSchema = Type.Object({
  id: Type.Integer({ minimum: 1 }),
  userId: Type.String(),
  status: OrderStatusSchema,
  total: Type.Number({ minimum: 0 }),
});
export type Order = Static<typeof OrderSchema>;

export const CreateOrderSchema = Type.Object(
  {
    userId: Type.String(),
    status: OrderStatusSchema,
    total: Type.Number({ minimum: 0 }),
  },
  { additionalProperties: false }
);
export type CreateOrderInput = Static<typeof CreateOrderSchema>;

export const PaginationQuerySchema = Type.Object(
  {
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
    cursor: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
  },
  { additionalProperties: false }
);
export type PaginationQuery = Static<typeof PaginationQuerySchema>;

export const PaginatedOrdersSchema = Type.Object({
  data: Type.Array(OrderSchema),
  nextCursor: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
});
export type PaginatedOrders = Static<typeof PaginatedOrdersSchema>;

export const OrderParamsSchema = Type.Object({
  id: Type.Integer({ minimum: 1 }),
});
export type OrderParams = Static<typeof OrderParamsSchema>;

export const PatchOrderBodySchema = Type.Object(
  { status: Type.Unsafe<OrderStatus>({ type: 'string', enum: ORDER_STATUSES }) },
  { additionalProperties: false }
);
export type PatchOrderBody = Static<typeof PatchOrderBodySchema>;

export const ValidationErrorSchema = Type.Object({
  statusCode: Type.Number(),
  code: Type.String(),
  error: Type.String(),
  message: Type.String(),
  requestId: Type.String(),
});

export const ErrorResponseSchema = Type.Object({
  statusCode: Type.Number(),
  error: Type.String(),
  message: Type.String(),
  requestId: Type.String(),
});

export const HealthResponseSchema = Type.Object({
  status: Type.Literal('ok'),
});
