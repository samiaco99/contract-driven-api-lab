import { buildApp } from './app.js';
import { SqliteOrderRepository } from './repositories/sqlite-order.repository.js';
import { parseConfig } from './config.js';
import { seedUsers } from './auth/user-store.js';

const config = parseConfig();

await seedUsers();

const repository = new SqliteOrderRepository({
  filename: config.databasePath,
  seed: true,
});

const { max, windowMs } = config.rateLimit;

const app = await buildApp({
  repository,
  jwtSecret: config.jwtSecret,
  jwtExpiresIn: config.jwtExpiresIn,
  bodyLimit: config.bodyLimitBytes,
  hardening: {
    corsOrigins: config.corsOrigins,
    ...(!config.rateLimit.enabled
      ? { rateLimit: false }
      : max !== undefined && windowMs !== undefined
      ? { rateLimit: { max, windowMs } }
      : {}),
  },
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, 'error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

try {
  await app.listen({ port: config.port });
  app.log.info(`Server running on http://localhost:${config.port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
