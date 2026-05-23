import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

const methodNotAllowedPlugin: FastifyPluginAsync = async (app) => {
  app.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split('?')[0];
    const knownMethods = ['DELETE', 'GET', 'HEAD', 'PATCH', 'POST', 'PUT'] as const;

    // hasRoute matches exact patterns only; for concrete URLs that hit a parameterized
    // route (e.g. /v1/orders/1 vs /v1/orders/:id), retry with the trailing numeric
    // segment replaced by :id so we can still detect a 405 vs 404 situation.
    const routeExists = (method: (typeof knownMethods)[number], url: string): boolean => {
      if (app.hasRoute({ method, url })) return true;
      const segs = url.split('/');
      const last = segs[segs.length - 1] ?? '';
      if (segs.length > 1 && /^\d+$/.test(last)) {
        return app.hasRoute({ method, url: segs.slice(0, -1).join('/') + '/:id' });
      }
      return false;
    };

    const allowedMethods = knownMethods.filter(m => routeExists(m, pathname));

    if (allowedMethods.length > 0) {
      return reply
        .status(405)
        .header('Allow', allowedMethods.join(', '))
        .send({
          statusCode: 405,
          error: 'Method Not Allowed',
          message: `Method ${request.method} is not allowed for this route`,
          requestId: request.id,
        });
    }

    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${request.method}:${request.url} not found`,
      requestId: request.id,
    });
  });
};

export default fp(methodNotAllowedPlugin);
