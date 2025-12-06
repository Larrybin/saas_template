import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerEnv } from '@/env/server';
import * as serverEnvModule from '@/env/server';
import { DomainError } from '@/lib/domain-errors';
import { handleCreemWebhook } from '@/lib/server/creem-webhook';
import { ErrorCodes } from '@/lib/server/error-codes';
import * as signatureModule from '@/payment/creem-signature';

vi.mock('@/payment/data-access/payment-repository', () => {
  class PaymentRepository {
    listByUser = vi.fn();
    findOneBySubscriptionId = vi.fn();
    findBySessionId = vi.fn();
    insert = vi.fn();
    upsertSubscription = vi.fn();
    updateBySubscriptionId = vi.fn();
    withTransaction = vi
      .fn()
      .mockImplementation(async (handler: (tx: unknown) => Promise<unknown>) =>
        handler({})
      );
  }

  return { PaymentRepository };
});

const creemEventRepositoryMock = {
  withEventProcessingLock: vi.fn(),
};

vi.mock('@/payment/data-access/creem-event-repository', () => {
  class CreemEventRepository {
    withEventProcessingLock = creemEventRepositoryMock.withEventProcessingLock;
  }

  return { CreemEventRepository };
});

vi.mock('@/credits/services/credit-ledger-service', () => {
  class CreditLedgerService {
    addCredits = vi.fn();
    addSubscriptionCredits = vi.fn();
    addLifetimeMonthlyCredits = vi.fn();
  }

  return { CreditLedgerService };
});

describe('handleCreemWebhook', () => {
  const originalEnv = { ...serverEnvModule.serverEnv };

  const mockServerEnv = (overrides: Partial<ServerEnv> = {}) => ({
    ...originalEnv,
    creemApiKey: 'api-key',
    creemWebhookSecret: 'secret',
    ...overrides,
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    creemEventRepositoryMock.withEventProcessingLock.mockReset();
    creemEventRepositoryMock.withEventProcessingLock.mockImplementation(
      async (
        _providerId: string,
        _event: unknown,
        handler: () => Promise<unknown>
      ) => ({
        skipped: false,
        result: await handler(),
      })
    );
  });

  it('throws domain error when payload is missing', async () => {
    await expect(handleCreemWebhook('', new Headers())).rejects.toBeInstanceOf(
      DomainError
    );
  });

  it('throws domain error when signature is missing', async () => {
    vi.spyOn(serverEnvModule, 'serverEnv', 'get').mockReturnValue(
      mockServerEnv()
    );
    await expect(
      handleCreemWebhook('{"id":"evt_1"}', new Headers())
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('throws misconfigured error when webhook secret is missing', async () => {
    const headers = new Headers({
      'creem-signature': 'any-signature',
    });

    vi.spyOn(serverEnvModule, 'serverEnv', 'get').mockReturnValue(
      mockServerEnv({ creemWebhookSecret: undefined })
    );

    await expect(
      handleCreemWebhook('{"id":"evt_1"}', headers)
    ).rejects.toMatchObject({
      code: ErrorCodes.CreemWebhookMisconfigured,
    });
  });

  it('throws misconfigured error when api key is missing', async () => {
    const headers = new Headers({
      'creem-signature': 'any-signature',
    });

    vi.spyOn(serverEnvModule, 'serverEnv', 'get').mockReturnValue(
      mockServerEnv({ creemApiKey: undefined })
    );

    await expect(
      handleCreemWebhook('{"id":"evt_1"}', headers)
    ).rejects.toMatchObject({
      code: ErrorCodes.CreemWebhookMisconfigured,
    });
  });

  it('throws security violation when signature is invalid', async () => {
    const headers = new Headers({
      'creem-signature': 'invalid',
    });

    vi.spyOn(serverEnvModule, 'serverEnv', 'get').mockReturnValue(
      mockServerEnv()
    );

    vi.spyOn(signatureModule, 'verifyCreemWebhookSignature').mockReturnValue(
      false
    );

    await expect(
      handleCreemWebhook('{"id":"evt_1"}', headers)
    ).rejects.toMatchObject({
      code: ErrorCodes.PaymentSecurityViolation,
    });
  });

  it('logs and resolves for valid events', async () => {
    const headers = new Headers({
      'creem-signature': 'valid',
    });

    vi.spyOn(serverEnvModule, 'serverEnv', 'get').mockReturnValue(
      mockServerEnv()
    );

    vi.spyOn(signatureModule, 'verifyCreemWebhookSignature').mockReturnValue(
      true
    );

    const payload = JSON.stringify({
      id: 'evt_1',
      eventType: 'checkout.completed',
      created_at: Date.now(),
      object: {
        id: 'chk_1',
        order: {
          id: 'order_1',
          customer: 'cust_1',
          product: 'prod_1',
          amount: 1000,
          currency: 'USD',
          status: 'paid',
          type: 'one_time',
          metadata: {
            user_id: 'user_1',
            product_type: 'credits',
            credits: 10,
          },
        },
        product: {
          id: 'prod_1',
          name: 'Test product',
          price: 1000,
          currency: 'USD',
          billing_type: 'one_time',
        },
        customer: {
          id: 'cust_1',
          email: 'user@example.com',
          name: 'User',
        },
        status: 'completed',
      },
    });

    await expect(handleCreemWebhook(payload, headers)).resolves.toBeUndefined();
  });

  it('passes raw payload to event repository for auditing', async () => {
    const headers = new Headers({
      'creem-signature': 'valid',
    });

    vi.spyOn(serverEnvModule, 'serverEnv', 'get').mockReturnValue(
      mockServerEnv()
    );

    vi.spyOn(signatureModule, 'verifyCreemWebhookSignature').mockReturnValue(
      true
    );

    const payload = JSON.stringify({
      id: 'evt_payload',
      eventType: 'checkout.completed',
      created_at: Date.now(),
      object: {
        id: 'chk_payload',
        order: {
          id: 'order_payload',
          customer: 'cust_payload',
          product: 'prod_payload',
          amount: 1000,
          currency: 'USD',
          status: 'paid',
          type: 'one_time',
        },
        product: {
          id: 'prod_payload',
          name: 'Test product',
          price: 1000,
          currency: 'USD',
          billing_type: 'one_time',
        },
        customer: {
          id: 'cust_payload',
          email: 'user@example.com',
          name: 'User',
        },
        metadata: {
          user_id: 'user_payload',
          product_type: 'credits',
        },
        status: 'completed',
      },
    });

    const callArgs: Array<{ payload?: string }> = [];
    creemEventRepositoryMock.withEventProcessingLock.mockImplementationOnce(
      async (_providerId, event, handler) => {
        callArgs.push(event as { payload?: string });
        return {
          skipped: false,
          result: await handler(),
        };
      }
    );

    await handleCreemWebhook(payload, headers);

    expect(callArgs[0]?.payload).toBe(payload);
  });
});
