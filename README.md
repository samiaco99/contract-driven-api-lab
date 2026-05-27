# Contract-Driven API Lab

![CI](https://github.com/samiaco99/contract-driven-api-lab/actions/workflows/ci.yml/badge.svg)
![Node](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-5-black?logo=fastify)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?logo=typescript&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-Integration%20Testing-6E9F18?logo=vitest&logoColor=white)
![OpenAPI](https://img.shields.io/badge/OpenAPI-Contract--Driven-6BA539)
![SQLite](https://img.shields.io/badge/SQLite-Persistence-003B57?logo=sqlite&logoColor=white)

Production-shaped Fastify + TypeScript backend QA portfolio project focused on
contract-driven API development, integration testing, persistence architecture,
JWT auth, and production-oriented quality engineering practices.

## Why This Project Exists

This project started as a learning/deepening exercise to better understand how
modern backend APIs are architected, validated, secured, tested, and operated
beyond traditional API automation alone.

The goal was not to build a large business domain, but to explore:
- schema-driven contracts with TypeBox
- OpenAPI generation
- HTTP-level integration testing
- repository and persistence patterns
- JWT authentication and authorization
- operational middleware and health checks
- SQLite migrations
- contract fuzzing in CI with Schemathesis

The project intentionally evolves from a simple CRUD API toward a more
production-shaped backend architecture while remaining small enough to study and
reason about incrementally.

## Stack

- Node.js 20+
- Fastify 5
- TypeScript ESM
- TypeBox
- better-sqlite3
- Vitest
- OpenAPI / Swagger UI
- Schemathesis in CI for contract fuzzing

## Setup

```bash
npm ci
npm run typecheck
npm run test:ci
npm run build
```

Start the development server:

```bash
npm run dev
```

The default server URL is:

```text
http://localhost:3000
```

Swagger UI is available at:

```text
http://localhost:3000/docs
```

The OpenAPI JSON is available at:

```text
http://localhost:3000/docs/json
```

## Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_PATH` | `./orders.db` | SQLite database file path |
| `PORT` | `3000` | HTTP server port |
| `JWT_SECRET` | required in `npm run dev` / `npm start` | JWT signing secret, minimum 32 characters |
| `JWT_EXPIRES_IN` | `1h` | JWT lifetime passed to `@fastify/jwt` |
| `BODY_LIMIT_BYTES` | Fastify app default of 1 MiB | Maximum accepted request body size |
| `CORS_ORIGINS` | unset | Comma-separated list of allowed origins |
| `RATE_LIMIT_MAX` | `100` | Max requests per rate-limit window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window in milliseconds |

Example:

```bash
JWT_SECRET=dev-secret-at-least-32-characters CORS_ORIGINS=http://localhost:5173 npm run dev
```

On PowerShell:

```powershell
$env:JWT_SECRET = "dev-secret-at-least-32-characters"
$env:CORS_ORIGINS = "http://localhost:5173"
npm run dev
```

## NPM Scripts

| Script | Purpose |
| --- | --- |
| `npm test` | Runs Vitest in watch mode |
| `npm run test:ci` | Runs Vitest once |
| `npm run dev` | Starts the TypeScript server through `tsx` |
| `npm start` | Starts the compiled server from `dist/server.js` |
| `npm run build` | Compiles TypeScript to `dist` |
| `npm run typecheck` | Runs `tsc --noEmit` |
| `npm run coverage` | Runs a c8 HTTP smoke coverage gate with 80% thresholds |
| `npm run test:contract` | Runs Schemathesis against a local server on `/docs/json` |
| `npm run openapi:export` | Writes generated OpenAPI to `openapi.json` |

## API Examples

### Health

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
```

### List Orders

```bash
curl http://localhost:3000/v1/orders \
  -H "authorization: Bearer $TOKEN"
```

### Paginate Orders

```bash
curl "http://localhost:3000/v1/orders?limit=2&cursor=0" \
  -H "authorization: Bearer $TOKEN"
```

The response shape is:

```json
{
  "data": [
    {
      "id": 1,
      "userId": "system",
      "status": "PENDING",
      "total": 120
    }
  ],
  "nextCursor": null
}
```

### Get Order By ID

```bash
curl http://localhost:3000/v1/orders/1 \
  -H "authorization: Bearer $TOKEN"
```

### Create Order

```bash
curl -X POST http://localhost:3000/v1/orders \
  -H "content-type: application/json" \
  -H "authorization: Bearer $TOKEN" \
  -d '{"userId":"alice","status":"PENDING","total":100}'
```

### Delete Order

```bash
curl -X DELETE http://localhost:3000/v1/orders/1 \
  -H "authorization: Bearer $TOKEN"
```

### Authenticated Requests

All `/v1/*` routes require a JWT bearer token. Issue a token from `/auth/token`
with either `admin` or `viewer` role:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/token \
  -H "content-type: application/json" \
  -d '{"userId":"alice","role":"admin"}' | jq -r .token)
```

`admin` can create, patch, and delete orders. `viewer` can read orders.
Invalid, missing, or expired credentials return `401` with a request ID in the
response body. Admins can only update or delete orders they own.

## Test Strategy

The main test approach is HTTP-level integration testing with Fastify
`app.inject()`. Tests build the real Fastify app in-process, send real HTTP
requests through Fastify's injection layer, and assert status codes, response
bodies, validation behavior, error shapes, and operational middleware behavior.

This gives strong API confidence without opening network ports during normal
unit/integration test runs.

Current test focus:

- CRUD behavior for orders
- TypeBox/Fastify request validation
- Response shapes for success and error cases
- SQLite-backed behavior through the same HTTP routes
- Cursor pagination
- JWT auth, role checks, and ownership checks
- Request ID propagation
- Security headers, CORS, rate limiting, and body size limits
- Environment configuration parsing
- SQLite migration behavior
- OpenAPI snapshot regression

CI also runs Schemathesis against a live local server and `/docs/json`. This is
contract fuzzing: Schemathesis generates requests from the OpenAPI document and
checks whether the running server behaves consistently with the published
contract.

To run the same contract test locally, start the API first:

```bash
export JWT_SECRET=dev-secret-at-least-32-characters
npm run dev
```

Then, in another terminal:

```bash
npm run test:contract
```

## k6 Performance Tests

The k6 scripts in `k6-performance-lab/tests` call the live API over HTTP. Start
the API first, then run k6 from another terminal. For local performance runs,
disable the API rate limiter so 429 responses do not dominate the results.

PowerShell:

```powershell
$env:JWT_SECRET = "dev-secret-at-least-32-characters"
$env:RATE_LIMIT_ENABLED = "false"
npm run dev
```

Then, in another PowerShell terminal:

```powershell
k6 run k6-performance-lab/tests/smoke.js
k6 run k6-performance-lab/tests/load.js
k6 run k6-performance-lab/tests/spike.js
k6 run k6-performance-lab/tests/stress.js
k6 run k6-performance-lab/tests/soak.js
```

By default, the k6 tests target `http://localhost:3000`. Override that with
`-e BASE_URL=http://host:port` if the API is running elsewhere.

## Architecture Notes

### TypeBox As Contract Source

Schemas in `src/schemas/order.schema.ts` define API request and response
contracts. TypeScript types are derived from those schemas with `Static<>`, so
runtime validation and compile-time typing share the same source.

### Repository Abstraction

Routes depend on a service layer, and services depend on the `OrderRepository`
interface. The project includes:

- `InMemoryOrderRepository` for fast isolated tests
- `SqliteOrderRepository` for persistence-backed behavior

The same HTTP tests can run against different repositories without route
changes.

### Middleware Stack

The app registers production-shaped middleware in `buildApp()`:

- JWT authentication for `/v1/*` routes
- Request ID propagation
- Helmet security headers
- CORS
- Rate limiting with health/docs bypass
- Body size limit
- Global error handler
- Swagger/OpenAPI generation

### Database

SQLite migrations are tracked in `schema_migrations`. Migrations create the
`orders` table with constraints that mirror the API contract and add the
`user_id` ownership column.

## CI Quality Gates

GitHub Actions runs:

- TypeScript typecheck
- Vitest HTTP-level integration tests
- c8 HTTP smoke coverage with 80% thresholds
- OpenAPI export and drift check
- Production build
- Schemathesis contract fuzzing against a running local server

## Docker

Build the production image:

```bash
docker build -t contract-driven-api-lab .
```

Run it:

```bash
docker run --rm -p 3000:3000 contract-driven-api-lab
```

The container needs a JWT secret:

```bash
docker run --rm -p 3000:3000 \
  -e JWT_SECRET=dev-secret-at-least-32-characters \
  contract-driven-api-lab
```
