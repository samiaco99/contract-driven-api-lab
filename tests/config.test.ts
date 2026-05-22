import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';

const JWT_SECRET = 'a'.repeat(32);

describe('parseConfig', () => {
  it('applies defaults when required env is present', () => {
    const config = parseConfig({ JWT_SECRET });

    expect(config.databasePath).toBe('./orders.db');
    expect(config.port).toBe(3000);
    expect(config.jwtSecret).toBe(JWT_SECRET);
    expect(config.jwtExpiresIn).toBe('1h');
    expect(config.bodyLimitBytes).toBeUndefined();
    expect(config.corsOrigins).toEqual([]);
    expect(config.rateLimit.max).toBeUndefined();
    expect(config.rateLimit.windowMs).toBeUndefined();
  });

  it('parses all values from env strings', () => {
    const config = parseConfig({
      DATABASE_PATH: '/data/app.db',
      PORT: '4000',
      JWT_SECRET,
      JWT_EXPIRES_IN: '15m',
      BODY_LIMIT_BYTES: '2097152',
      CORS_ORIGINS: 'https://a.example, https://b.example',
      RATE_LIMIT_MAX: '200',
      RATE_LIMIT_WINDOW_MS: '30000',
    });

    expect(config.databasePath).toBe('/data/app.db');
    expect(config.port).toBe(4000);
    expect(config.jwtSecret).toBe(JWT_SECRET);
    expect(config.jwtExpiresIn).toBe('15m');
    expect(config.bodyLimitBytes).toBe(2097152);
    expect(config.corsOrigins).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
    expect(config.rateLimit.max).toBe(200);
    expect(config.rateLimit.windowMs).toBe(30000);
  });

  it('throws when JWT_SECRET is missing', () => {
    expect(() => parseConfig({})).toThrow('Invalid environment configuration');
  });

  it('throws when JWT_SECRET is too short', () => {
    expect(() => parseConfig({ JWT_SECRET: 'too-short' })).toThrow(
      'Invalid environment configuration',
    );
  });

  it('throws on non-numeric PORT', () => {
    expect(() => parseConfig({ JWT_SECRET, PORT: 'not-a-number' })).toThrow(
      'Invalid environment configuration',
    );
  });

  it('throws on PORT out of valid range', () => {
    expect(() => parseConfig({ JWT_SECRET, PORT: '99999' })).toThrow(
      'Invalid environment configuration',
    );
  });

  it('throws on non-positive BODY_LIMIT_BYTES', () => {
    expect(() => parseConfig({ JWT_SECRET, BODY_LIMIT_BYTES: '0' })).toThrow(
      'Invalid environment configuration',
    );
  });

  it('throws on non-positive RATE_LIMIT_MAX', () => {
    expect(() => parseConfig({ JWT_SECRET, RATE_LIMIT_MAX: '-5' })).toThrow(
      'Invalid environment configuration',
    );
  });
});
