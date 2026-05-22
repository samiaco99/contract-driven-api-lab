# CLAUDE.md

## Project overview
A contract-driven Fastify + TypeScript REST API. Every architectural decision is intentional — read this file before making any change.

## Stack
- **Runtime**: Node.js + TypeScript (ESM)
- **Framework**: Fastify with `@fastify/type-provider-typebox`
- **Validation**: TypeBox — single source of truth for schemas, types, and OpenAPI
- **Database**: SQLite via `better-sqlite3` (synchronous API)
- **Testing**: Vitest + `app.inject()` integration tests
- **Auth**: `@fastify/jwt` (being added)

## Architecture rules — never break these

### Layering
- Routes handle HTTP only: parse input, call service, return response
- Services own all business logic and domain rules
- Repositories own all data access — no SQL outside repository files
- No business logic in route handlers. No HTTP concerns in services or repositories.

### TypeBox
- Every request body, response, and config value must have a TypeBox schema
- Use `Static<typeof Schema>` for TypeScript types — never duplicate type definitions
- Schema defaults are applied by Fastify/AJV before handlers run — do not duplicate defaults in JS code

### Error handling
- Domain errors live in `src/errors/` and extend `Error`
- All errors are mapped to HTTP status codes in `src/errors/error-handler.ts`
- Never return raw error messages from route handlers
- 401 = unauthenticated (identity unknown), 403 = unauthorized (identity known, permission denied)

### Repositories
- Both `InMemoryOrderRepository` and `SqliteOrderRepository` must implement `IOrderRepository`
- Every change to the interface must be reflected in both implementations
- Repository methods accept an optional logger as the last parameter — use `log?.debug(...)` pattern
- Do NOT use `FastifyBaseLogger` in repository interfaces — use a minimal custom logger interface or pino's `BaseLogger`

### Tests
- Tests use `app.inject()` — never start a real HTTP server in tests
- Each test file constructs a fresh app instance — no shared state between tests
- `JWT_SECRET` in tests must be generated at runtime: `crypto.randomBytes(32).toString('hex')`
- Never hardcode secrets, tokens, or credentials in test files
- Test behavior, not implementation — assert HTTP responses, not internal state

### Security
- Never log JWT secrets, raw tokens, or API keys
- `.env` is in `.gitignore` — never commit real credentials
- `.env.example` shows variable names with no values

### OpenAPI
- Every route must have a TypeBox response schema — no `Default Response` in the spec
- After any schema change, regenerate: `npm run openapi:export`
- The CI drift check (`git diff --exit-code openapi.json`) must stay green

## Commands
```
npm run dev          # start with tsx watch
npm run test:ci      # run full test suite
npm run typecheck    # tsc --noEmit
npm run openapi:export  # regenerate openapi.json
```

## When making changes
1. Read the relevant existing file before touching it
2. Follow the pattern already in place — do not introduce new patterns without a reason
3. After any change: run `npm run test:ci` and `npm run typecheck`
4. After any schema change: run `npm run openapi:export` and update the snapshot with `npm run test -- -u`
5. Do not refactor files unrelated to the current task