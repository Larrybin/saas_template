import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as serverEnvModule from '@/env/server';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes, type PaymentErrorCode } from '@/lib/server/error-codes';
import { createCreemClientFromEnv } from '@/payment/services/creem-client';

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

const originalEnv = { ...serverEnvModule.serverEnv };

describe('createCreemClientFromEnv', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws DomainError when required env vars are missing', async () => {
    vi.spyOn(serverEnvModule, 'serverEnv', 'get').mockReturnValue({
      ...originalEnv,
      creemApiKey: undefined,
      creemApiUrl: undefined,
    });

    let error: unknown;
    try {
      createCreemClientFromEnv();
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(DomainError);
    const domainError = error as DomainError<PaymentErrorCode>;
    expect(domainError.code).toBe(ErrorCodes.CreemProviderMisconfigured);
    expect(domainError.retryable).toBe(false);
    expect(domainError.message).toContain('Missing Creem configuration');
  });
});

describe('CreemClient.createCheckout error mapping', () => {
  beforeEach(() => {
    vi.spyOn(serverEnvModule, 'serverEnv', 'get').mockReturnValue({
      ...originalEnv,
      creemApiKey: 'test-key',
      creemApiUrl: 'https://creem.test/v1',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setupClient = () => createCreemClientFromEnv();

  it('maps 400/422 to CREEM_CHECKOUT_INVALID_REQUEST', async () => {
    const client = setupClient();

    const fetchMock = vi
      .spyOn(globalThis as any, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({ error: 'invalid' }),
      } as any);

    await expect(
      client.createCheckout({
        productId: 'prod_1',
        customerEmail: 'user@example.com',
      })
    ).rejects.toMatchObject({
      code: ErrorCodes.CreemCheckoutInvalidRequest,
      retryable: false,
    });

    fetchMock.mockRestore();
  });

  it('maps 401/403 to CREEM_PROVIDER_MISCONFIGURED', async () => {
    const client = setupClient();

    const fetchMock = vi
      .spyOn(globalThis as any, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ error: 'unauthorized' }),
      } as any);

    await expect(
      client.createCheckout({
        productId: 'prod_1',
        customerEmail: 'user@example.com',
      })
    ).rejects.toMatchObject({
      code: ErrorCodes.CreemProviderMisconfigured,
      retryable: false,
    });

    fetchMock.mockRestore();
  });

  it('maps 500 to CREEM_CHECKOUT_DOWNSTREAM_ERROR with retryable=true', async () => {
    const client = setupClient();

    const fetchMock = vi
      .spyOn(globalThis as any, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({ error: 'server' }),
      } as any);

    await expect(
      client.createCheckout({
        productId: 'prod_1',
        customerEmail: 'user@example.com',
      })
    ).rejects.toMatchObject({
      code: ErrorCodes.CreemCheckoutDownstreamError,
      retryable: true,
    });

    fetchMock.mockRestore();
  });

  it('maps other non-auth 4xx to CREEM_CHECKOUT_DOWNSTREAM_ERROR with retryable=false', async () => {
    const client = setupClient();

    const fetchMock = vi
      .spyOn(globalThis as any, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: vi.fn().mockResolvedValue({ error: 'not_found' }),
      } as any);

    await expect(
      client.createCheckout({
        productId: 'prod_1',
        customerEmail: 'user@example.com',
      })
    ).rejects.toMatchObject({
      code: ErrorCodes.CreemCheckoutDownstreamError,
      retryable: false,
    });

    fetchMock.mockRestore();
  });

  it('maps network errors to CREEM_CHECKOUT_NETWORK_ERROR', async () => {
    const client = setupClient();

    const fetchMock = vi
      .spyOn(globalThis as any, 'fetch')
      .mockRejectedValueOnce(new Error('network error') as any);

    await expect(
      client.createCheckout({
        productId: 'prod_1',
        customerEmail: 'user@example.com',
      })
    ).rejects.toMatchObject({
      code: ErrorCodes.CreemCheckoutNetworkError,
      retryable: true,
    });

    fetchMock.mockRestore();
  });
});
