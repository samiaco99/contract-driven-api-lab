import { FastifyError, FastifyInstance } from 'fastify';
import {
  OrderConflictError,
  OrderForbiddenError,
  OrderNotFoundError,
} from './domain.errors.js';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: Error, request, reply) => {
    if (error instanceof OrderNotFoundError) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof OrderConflictError) {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof OrderForbiddenError) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: error.message,
        requestId: request.id,
      });
    }

    const fe = error as FastifyError;
    if (fe.validation) {
      request.log.info({ err: error }, 'validation error');
      return reply.status(fe.statusCode ?? 400).send({
        statusCode: fe.statusCode ?? 400,
        code: fe.code,
        error: fe.name,
        message: fe.message,
        requestId: request.id,
      });
    }

    const statusCode = fe.statusCode ?? 500;

    if (statusCode < 500) {
      return reply.status(statusCode).send({
        statusCode,
        code: fe.code,
        error: fe.name || clientErrorName(statusCode),
        message: fe.message,
        requestId: request.id,
      });
    }

    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal Server Error',
      requestId: request.id,
    });
  });
}

function clientErrorName(statusCode: number): string {
  if (statusCode === 413) {
    return 'Payload Too Large';
  }

  if (statusCode === 429) {
    return 'Too Many Requests';
  }

  return 'Bad Request';
}
