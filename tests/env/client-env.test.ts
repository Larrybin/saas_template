import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';

const BASE_ENV = {
  NEXT_PUBLIC_BASE_URL: 'https://example.com',
  NEXT_PUBLIC_MAIL_FROM_EMAIL: 'Support <support@example.com>',
  NEXT_PUBLIC_MAIL_SUPPORT_EMAIL: 'Support <support@example.com>',
} as const;

type ClientEnvKeys = keyof typeof BASE_ENV;

const applyClientEnv = (
  overrides: Partial<Record<ClientEnvKeys, string | undefined>> = {}
) => {
  (Object.keys(BASE_ENV) as ClientEnvKeys[]).forEach((key) => {
    const hasOverride = Object.hasOwn(overrides, key);
    const nextValue = hasOverride ? overrides[key] : BASE_ENV[key];
    if (nextValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = nextValue;
    }
  });
};

const loadClientEnvModule = () => import('@/env/client');

describe('clientEnv', () => {
  beforeEach(() => {
    vi.resetModules();
    applyClientEnv();
  });

  afterAll(() => {
    vi.resetModules();
    applyClientEnv();
  });

  test('parses valid client env snapshot', async () => {
    const { clientEnv } = await loadClientEnvModule();

    expect(clientEnv.baseUrl).toBe(BASE_ENV.NEXT_PUBLIC_BASE_URL);
    expect(clientEnv.mail.from).toBe(BASE_ENV.NEXT_PUBLIC_MAIL_FROM_EMAIL);
    expect(clientEnv.mail.support).toBe(
      BASE_ENV.NEXT_PUBLIC_MAIL_SUPPORT_EMAIL
    );
  });

  test('throws when required env variables are missing', async () => {
    vi.resetModules();
    applyClientEnv({ NEXT_PUBLIC_BASE_URL: undefined });

    expect.assertions(1);

    await loadClientEnvModule()
      .then(() => {
        throw new Error('Expected client env import to fail');
      })
      .catch((error) => {
        expect(error.message).toBe('Invalid client environment variables');
      });
  });
});
