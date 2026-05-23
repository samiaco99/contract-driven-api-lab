import type { FastifyInstance, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

export interface HardeningOptions {
  corsOrigins?: string[];
  rateLimit?:
    | false
    | {
        max: number;
        windowMs: number;
      };
}

const DEFAULT_RATE_LIMIT = { max: 100, windowMs: 60_000 };

function isRateLimitBypassPath(url: string): boolean {
  const path = url.split('?', 1)[0];
  return path.startsWith('/health') || path.startsWith('/docs');
}

export async function registerHardening(
  app: FastifyInstance,
  options: HardeningOptions = {}
): Promise<void> {
  const corsOrigins = options.corsOrigins ?? [];
  const limiter = options.rateLimit ?? DEFAULT_RATE_LIMIT;

  await app.register(helmet, {
    frameguard: {
      action: 'deny',
    },
    referrerPolicy: {
      policy: 'no-referrer',
    },
    crossOriginResourcePolicy: {
      policy: 'same-origin',
    },
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, false);
        return;
      }

      callback(null, isCorsOriginAllowed(origin, corsOrigins) ? origin : false);
    },
    methods: ['GET', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-request-id', 'authorization'],
  });

  if (limiter === false) {
    return;
  }

  await app.register(rateLimit, {
    max: limiter.max,
    timeWindow: limiter.windowMs,
    allowList: (request: FastifyRequest) => isRateLimitBypassPath(request.url),
    errorResponseBuilder: (request) => {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
        requestId: request.id,
      };
    },
  });
}

function isCorsOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
}
