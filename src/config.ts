import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

const EnvSchema = Type.Object({
  NODE_ENV: Type.Optional(Type.String()),
  DATABASE_PATH: Type.String({ default: './orders.db' }),
  PORT: Type.Integer({ minimum: 1, maximum: 65535, default: 3000 }),
  JWT_SECRET: Type.String({ minLength: 32 }),
  JWT_EXPIRES_IN: Type.String({ default: '1h' }),
  BODY_LIMIT_BYTES: Type.Optional(Type.Integer({ minimum: 1 })),
  CORS_ORIGINS: Type.Optional(Type.String()),
  RATE_LIMIT_ENABLED: Type.Optional(Type.Boolean()),
  RATE_LIMIT_MAX: Type.Optional(Type.Integer({ minimum: 1 })),
  RATE_LIMIT_WINDOW_MS: Type.Optional(Type.Integer({ minimum: 1 })),
});

type Env = Static<typeof EnvSchema>;

export interface Config {
  databasePath: string;
  port: number;
  jwtSecret: string;
  jwtExpiresIn: string;
  bodyLimitBytes: number | undefined;
  corsOrigins: string[];
  rateLimit: {
    enabled: boolean;
    max: number | undefined;
    windowMs: number | undefined;
  };
}

export function parseConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  const withDefaults = Value.Default(EnvSchema, { ...env });
  const converted = Value.Convert(EnvSchema, withDefaults);

  if (!Value.Check(EnvSchema, converted)) {
    const errors = [...Value.Errors(EnvSchema, converted)];
    const lines = errors
      .map((e) => `  ${e.path || '(root)'}: ${e.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${lines}`);
  }

  const parsed = converted as Env;

  return {
    databasePath: parsed.DATABASE_PATH,
    port: parsed.PORT,
    jwtSecret: parsed.JWT_SECRET,
    jwtExpiresIn: parsed.JWT_EXPIRES_IN,
    bodyLimitBytes: parsed.BODY_LIMIT_BYTES,
    corsOrigins: parsed.CORS_ORIGINS
      ? parsed.CORS_ORIGINS.split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    rateLimit: {
      enabled:
        parsed.NODE_ENV !== 'test' && parsed.RATE_LIMIT_ENABLED !== false,
      max: parsed.RATE_LIMIT_MAX,
      windowMs: parsed.RATE_LIMIT_WINDOW_MS,
    },
  };
}
