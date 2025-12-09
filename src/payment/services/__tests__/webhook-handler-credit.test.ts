import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveExecutor } from '@/credits/services/transaction-context';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import {
  createCheckoutSessionLike,
  createWebhookDeps,
} from '../../../../tests/helpers/payment';
import type { StripeCheckoutCompletedEventLike } from '../stripe-deps';
import { handleStripeWebhookEvent } from '../webhook-handler';

const getCreditPackageByIdMock = vi.fn();

vi.mock('@/credits/server', () => ({
  getCreditPackageById: (packageId: string) =>
    getCreditPackageByIdMock(packageId),
}));

describe('handleStripeWebhookEvent - credit purchases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('awards purchased credits and records payment when metadata is complete', async () => {
    getCreditPackageByIdMock.mockReturnValue({
      id: 'pkg_basic',
      amount: 40,
      expireDays: 15,
    });
    const deps = createWebhookDeps();
    const session = createCheckoutSessionLike({
      metadata: {
        type: 'credit_purchase',
        userId: 'user-1',
        packageId: 'pkg_basic',
        credits: '40',
        priceId: 'price_credit',
      },
      amount_total: 5000,
    });
    const event: StripeCheckoutCompletedEventLike = {
      id: 'evt_credit',
      type: 'checkout.session.completed',
      created: 1,
      data: { object: session },
    };

    await handleStripeWebhookEvent(event, deps);

    expect(deps.creditsGateway.addCredits).toHaveBeenCalledTimes(1);
    expect(deps.creditsGateway.addCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        amount: 40,
        type: CREDIT_TRANSACTION_TYPE.PURCHASE_PACKAGE,
        description: '+40 credits for package pkg_basic',
        paymentId: session.id,
        expireDays: 15,
      }),
      expect.anything()
    );
    await expect(
      deps.paymentRepository.findBySessionId(session.id)
    ).resolves.toBeTruthy();
    expect(deps.notificationGateway.notifyPurchase).not.toHaveBeenCalled();
    const firstCall =
      deps.creditsGateway.addCredits.mock.calls.at(0) ?? undefined;
    expect(firstCall).toBeDefined();
    const transactionArg = firstCall?.[1];
    expect(transactionArg).toBeDefined();
    expect(resolveExecutor(transactionArg)).toBeDefined();
  });

  it('logs and surfaces error when credit purchase metadata is missing', async () => {
    getCreditPackageByIdMock.mockReturnValue({
      id: 'pkg_basic',
      amount: 10,
    });
    const deps = createWebhookDeps();
    const session = createCheckoutSessionLike({
      metadata: {
        type: 'credit_purchase',
        packageId: 'pkg_basic',
        credits: '10',
      },
    });
    const event: StripeCheckoutCompletedEventLike = {
      id: 'evt_missing',
      type: 'checkout.session.completed',
      created: 1,
      data: { object: session },
    };

    await expect(handleStripeWebhookEvent(event, deps)).rejects.toThrow(
      'Credit purchase metadata is missing required fields'
    );

    expect(deps.logger.error).toHaveBeenCalledWith(
      {
        sessionId: session.id,
        metadata: session.metadata,
      },
      'Credit purchase webhook missing metadata'
    );
    expect(deps.creditsGateway.addCredits).not.toHaveBeenCalled();
    await expect(
      deps.paymentRepository.findBySessionId(session.id)
    ).resolves.toBeUndefined();
  });

  it('logs warning when credit package configuration is missing', async () => {
    getCreditPackageByIdMock.mockReturnValue(undefined);
    const deps = createWebhookDeps();
    const session = createCheckoutSessionLike({
      metadata: {
        type: 'credit_purchase',
        userId: 'user-1',
        packageId: 'pkg_missing',
        credits: '10',
      },
    });
    const event: StripeCheckoutCompletedEventLike = {
      id: 'evt_missing_pkg',
      type: 'checkout.session.completed',
      created: 1,
      data: { object: session },
    };

    await handleStripeWebhookEvent(event, deps);

    expect(deps.logger.warn).toHaveBeenCalledWith(
      { packageId: 'pkg_missing' },
      'Credit package not found for purchase'
    );
    expect(deps.creditsGateway.addCredits).not.toHaveBeenCalled();
    await expect(
      deps.paymentRepository.findBySessionId(session.id)
    ).resolves.toBeUndefined();
  });

  it('does not double process a session that already exists', async () => {
    getCreditPackageByIdMock.mockReturnValue({
      id: 'pkg_basic',
      amount: 10,
    });
    const deps = createWebhookDeps();
    const session = createCheckoutSessionLike({
      metadata: {
        type: 'credit_purchase',
        userId: 'user-1',
        packageId: 'pkg_basic',
        credits: '10',
      },
    });
    const event: StripeCheckoutCompletedEventLike = {
      id: 'evt_dup',
      type: 'checkout.session.completed',
      created: 1,
      data: { object: session },
    };

    await handleStripeWebhookEvent(event, deps);
    await handleStripeWebhookEvent(event, deps);

    expect(deps.creditsGateway.addCredits).toHaveBeenCalledTimes(1);
    await expect(
      deps.paymentRepository.findBySessionId(session.id)
    ).resolves.toBeTruthy();
  });

  it('surface gateway errors without sending notifications', async () => {
    getCreditPackageByIdMock.mockReturnValue({
      id: 'pkg_basic',
      amount: 10,
    });
    const deps = createWebhookDeps();
    deps.creditsGateway.addCredits.mockRejectedValueOnce(
      new Error('gateway failure')
    );
    const session = createCheckoutSessionLike({
      metadata: {
        type: 'credit_purchase',
        userId: 'user-1',
        packageId: 'pkg_basic',
        credits: '10',
      },
    });
    const event: StripeCheckoutCompletedEventLike = {
      id: 'evt_gateway_error',
      type: 'checkout.session.completed',
      created: 1,
      data: { object: session },
    };

    await expect(handleStripeWebhookEvent(event, deps)).rejects.toThrow(
      'gateway failure'
    );
    expect(deps.notificationGateway.notifyPurchase).not.toHaveBeenCalled();
    await expect(
      deps.paymentRepository.findBySessionId(session.id)
    ).resolves.toBeTruthy();
  });
});
