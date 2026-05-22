import '../auth/jwt-types.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (err: unknown) {
    const error = err as Error;
    const code = (error as { code?: string }).code;
    const isExpired =
      code === 'FAST_JWT_EXPIRED' ||
      code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED';
    const message = isExpired ? 'Token expired' : 'Unauthorized';
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message,
      requestId: request.id,
    });
  }
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (request.user.role !== 'admin') {
    return reply.status(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Insufficient permissions',
      requestId: request.id,
    });
  }
}
