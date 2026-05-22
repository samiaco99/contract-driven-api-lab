import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';

describe('OpenAPI contract', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('matches the generated OpenAPI snapshot', () => {
    expect(app.swagger()).toMatchSnapshot();
  });

  describe('response shape assertions', () => {
    it('GET /v1/orders 200 response has a data array and a nextCursor field', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spec = app.swagger() as any;
      const schema =
        spec.paths['/v1/orders'].get.responses['200'].content['application/json'].schema;

      expect(schema.properties.data.type).toBe('array');
      expect(schema.properties).toHaveProperty('nextCursor');
      expect(schema.required).toContain('data');
      expect(schema.required).toContain('nextCursor');
    });

    it('GET /v1/orders/{id} 200 response has id, status, total, and userId fields', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spec = app.swagger() as any;
      const schema =
        spec.paths['/v1/orders/{id}'].get.responses['200'].content['application/json'].schema;

      expect(schema.required).toEqual(expect.arrayContaining(['id', 'status', 'total', 'userId']));
    });

    it('POST /v1/orders 201 response has id, status, total, and userId fields', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spec = app.swagger() as any;
      const schema =
        spec.paths['/v1/orders'].post.responses['201'].content['application/json'].schema;

      expect(schema.required).toEqual(expect.arrayContaining(['id', 'status', 'total', 'userId']));
    });

    it('PATCH /v1/orders/{id} 200 response has id, status, and total; 409 and 403 responses exist', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spec = app.swagger() as any;
      const patchResponses = spec.paths['/v1/orders/{id}'].patch.responses;
      const schema200 =
        patchResponses['200'].content['application/json'].schema;

      expect(schema200.required).toEqual(expect.arrayContaining(['id', 'status', 'total']));
      expect(patchResponses).toHaveProperty('409');
      expect(patchResponses).toHaveProperty('403');
    });

    it('DELETE /v1/orders/{id} 204 response exists and 403 response exists', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spec = app.swagger() as any;
      const deleteResponses = spec.paths['/v1/orders/{id}'].delete.responses;

      expect(deleteResponses).toHaveProperty('204');
      expect(deleteResponses).toHaveProperty('403');
    });

    it('GET /health/live 200 response has a status field', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spec = app.swagger() as any;
      const schema =
        spec.paths['/health/live'].get.responses['200'].content['application/json'].schema;

      expect(schema.properties).toHaveProperty('status');
      expect(schema.required).toContain('status');
    });

    it('POST /auth/token 200 response has a token field', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spec = app.swagger() as any;
      const schema =
        spec.paths['/auth/token'].post.responses['200'].content['application/json'].schema;

      expect(schema.properties).toHaveProperty('token');
      expect(schema.required).toContain('token');
    });

    it('bearerAuth security scheme is defined in components', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spec = app.swagger() as any;

      expect(spec.components.securitySchemes).toHaveProperty('bearerAuth');
      expect(spec.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
    });
  });
});
