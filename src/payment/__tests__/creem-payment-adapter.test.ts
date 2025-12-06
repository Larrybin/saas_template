import { describe, expect, it, vi } from 'vitest';
import { websiteConfig } from '@/config/website';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';
import type { CreemCheckoutMetadata } from '@/payment/creem-types';
import type { CreemClient } from '@/payment/services/creem-client';
import {
  CreemPaymentProvider,
  getMetadataFromCreemCheckout,
  toCreemMetadataPayload,
  toCreemOrderMetadata,
} from '@/payment/services/creem-payment-adapter';
import type { SubscriptionQueryService } from '@/payment/services/subscription-query-service';
import type { Subscription } from '@/payment/types';
import { PaymentTypes } from '@/payment/types';

describe('CreemPaymentProvider', () => {
  it('delegates checkout creation to CreemClient with correct params', async () => {
    const createCheckoutMock = vi.fn().mockResolvedValue({
      checkoutId: 'chk_123',
      checkoutUrl: 'https://creem.test/checkout/chk_123',
    });

    const client: CreemClient = {
      createCheckout: createCheckoutMock,
    };

    const subscriptionQueryService = {
      getSubscriptions: vi.fn(),
    } as unknown as SubscriptionQueryService;

    // 配置 Creem 映射：pro/price_123 -> productId = price_123
    websiteConfig.payment.creem = {
      ...(websiteConfig.payment.creem ?? {}),
      subscriptionProducts: {
        pro: {
          price_123: { productId: 'price_123' },
        },
      },
      creditProducts: websiteConfig.payment.creem?.creditProducts ?? {},
    };

    const provider = new CreemPaymentProvider({
      creemClient: client,
      subscriptionQueryService,
    });

    const result = await provider.createCheckout({
      planId: 'pro',
      priceId: 'price_123',
      customerEmail: 'user@example.com',
      successUrl: 'https://app.test/success',
      cancelUrl: 'https://app.test/cancel',
      metadata: { foo: 'bar' },
    });

    expect(createCheckoutMock).toHaveBeenCalledTimes(1);
    expect(createCheckoutMock).toHaveBeenCalledWith({
      productId: 'price_123',
      customerEmail: 'user@example.com',
      requestId: expect.any(String),
      metadata: expect.objectContaining({
        foo: 'bar',
        provider_id: 'creem',
        request_id: expect.any(String),
      }),
      successUrl: 'https://app.test/success',
      cancelUrl: 'https://app.test/cancel',
    });

    expect(result).toEqual({
      id: 'chk_123',
      url: 'https://creem.test/checkout/chk_123',
    });
  });

  it('delegates credit checkout creation to CreemClient and falls back to packageId when priceId is missing', async () => {
    const createCheckoutMock = vi.fn().mockResolvedValue({
      checkoutId: 'chk_credits',
      checkoutUrl: 'https://creem.test/checkout/chk_credits',
    });

    const client: CreemClient = {
      createCheckout: createCheckoutMock,
    };

    const subscriptionQueryService = {
      getSubscriptions: vi.fn(),
    } as unknown as SubscriptionQueryService;

    // 配置 Creem 映射：credits_basic -> productId = credits_basic
    websiteConfig.payment.creem = {
      ...(websiteConfig.payment.creem ?? {}),
      creditProducts: {
        credits_basic: { productId: 'credits_basic' },
      },
      subscriptionProducts:
        websiteConfig.payment.creem?.subscriptionProducts ?? {},
    };

    const provider = new CreemPaymentProvider({
      creemClient: client,
      subscriptionQueryService,
    });

    const result = await provider.createCreditCheckout({
      packageId: 'credits_basic',
      customerEmail: 'user@example.com',
      metadata: { product_type: 'credits' },
    });

    expect(createCheckoutMock).toHaveBeenCalledTimes(1);
    expect(createCheckoutMock).toHaveBeenCalledWith({
      productId: 'credits_basic',
      customerEmail: 'user@example.com',
      requestId: expect.any(String),
      metadata: expect.objectContaining({
        product_type: 'credits',
        provider_id: 'creem',
        request_id: expect.any(String),
      }),
    });

    expect(result).toEqual({
      id: 'chk_credits',
      url: 'https://creem.test/checkout/chk_credits',
    });
  });

  it('returns my-orders URL for customer portal in Phase A', async () => {
    const client: CreemClient = {
      createCheckout: vi.fn(),
    };

    const subscriptionQueryService = {
      getSubscriptions: vi.fn(),
    } as unknown as SubscriptionQueryService;

    const provider = new CreemPaymentProvider({
      creemClient: client,
      subscriptionQueryService,
    });

    const result = await provider.createCustomerPortal({
      customerId: 'cust_1',
    });

    expect(result.url).toBe('https://creem.io/my-orders/login');
  });

  it('delegates getSubscriptions to SubscriptionQueryService', async () => {
    const client: CreemClient = {
      createCheckout: vi.fn(),
    };

    const subscriptions: Subscription[] = [];
    const subscriptionQueryService = {
      getSubscriptions: vi.fn().mockResolvedValue(subscriptions),
    } as unknown as SubscriptionQueryService;

    const provider = new CreemPaymentProvider({
      creemClient: client,
      subscriptionQueryService,
    });

    const params = { userId: 'user_1' };
    const result = await provider.getSubscriptions(params);

    expect(subscriptionQueryService.getSubscriptions).toHaveBeenCalledWith(
      params
    );
    expect(result).toBe(subscriptions);
  });

  it('rethrows DomainError from CreemClient without wrapping', async () => {
    const domainError = new DomainError({
      code: ErrorCodes.CreemCheckoutDownstreamError,
      message: 'creem downstream error',
      retryable: true,
    });

    const client: CreemClient = {
      createCheckout: vi.fn().mockRejectedValue(domainError),
    };

    const subscriptionQueryService = {
      getSubscriptions: vi.fn(),
    } as unknown as SubscriptionQueryService;

    websiteConfig.payment.creem = {
      ...(websiteConfig.payment.creem ?? {}),
      subscriptionProducts: {
        pro: {
          price_123: { productId: 'price_123' },
        },
      },
      creditProducts: websiteConfig.payment.creem?.creditProducts ?? {},
    };

    const provider = new CreemPaymentProvider({
      creemClient: client,
      subscriptionQueryService,
    });

    await expect(
      provider.createCheckout({
        planId: 'pro',
        priceId: 'price_123',
        customerEmail: 'user@example.com',
      })
    ).rejects.toBe(domainError);
  });

  it('throws DomainError with CREEM_PROVIDER_MISCONFIGURED when subscription mapping is missing', async () => {
    const client: CreemClient = {
      createCheckout: vi.fn(),
    };

    const subscriptionQueryService = {
      getSubscriptions: vi.fn(),
    } as unknown as SubscriptionQueryService;

    websiteConfig.payment.creem = {
      ...(websiteConfig.payment.creem ?? {}),
      subscriptionProducts: {},
      creditProducts: websiteConfig.payment.creem?.creditProducts ?? {},
    };

    const provider = new CreemPaymentProvider({
      creemClient: client,
      subscriptionQueryService,
    });

    await expect(
      provider.createCheckout({
        planId: 'unknown_plan',
        priceId: 'unknown_price',
        customerEmail: 'user@example.com',
      })
    ).rejects.toMatchObject({
      code: ErrorCodes.CreemProviderMisconfigured,
      retryable: false,
    });
  });

  it('throws DomainError with CREEM_PROVIDER_MISCONFIGURED when credit mapping is missing', async () => {
    const client: CreemClient = {
      createCheckout: vi.fn(),
    };

    const subscriptionQueryService = {
      getSubscriptions: vi.fn(),
    } as unknown as SubscriptionQueryService;

    websiteConfig.payment.creem = {
      ...(websiteConfig.payment.creem ?? {}),
      creditProducts: {},
      subscriptionProducts:
        websiteConfig.payment.creem?.subscriptionProducts ?? {},
    };

    const provider = new CreemPaymentProvider({
      creemClient: client,
      subscriptionQueryService,
    });

    await expect(
      provider.createCreditCheckout({
        packageId: 'unknown_package',
        customerEmail: 'user@example.com',
      })
    ).rejects.toMatchObject({
      code: ErrorCodes.CreemProviderMisconfigured,
      retryable: false,
    });
  });
});

describe('Creem metadata helpers', () => {
  it('normalizes raw metadata into Creem order metadata for subscription', () => {
    const raw = {
      userId: 'user_sub',
      anyKey: 'any-value',
    };

    const normalized = toCreemOrderMetadata(raw, PaymentTypes.SUBSCRIPTION);

    expect(normalized).toMatchObject({
      userId: 'user_sub',
      anyKey: 'any-value',
      user_id: 'user_sub',
      product_type: 'subscription',
    });
  });

  it('normalizes raw metadata into Creem order metadata for credits and parses credits as number', () => {
    const raw = {
      userId: 'user_credits',
      credits: '150',
    };

    const normalized = toCreemOrderMetadata(raw, 'credits');

    expect(normalized).toMatchObject({
      userId: 'user_credits',
      user_id: 'user_credits',
      product_type: 'credits',
      credits: 150,
    });
  });

  it('keeps raw metadata when userId is missing', () => {
    const raw = {
      anyKey: 'any-value',
    };

    const normalized = toCreemOrderMetadata(
      raw as Record<string, string>,
      PaymentTypes.SUBSCRIPTION
    );

    expect(normalized).toEqual(raw);
  });

  it('maps internal metadata to Creem payload and back from checkout metadata', () => {
    const internal: CreemCheckoutMetadata = {
      userId: 'user_1',
      productType: PaymentTypes.SUBSCRIPTION,
      credits: 100,
    };

    const creem = toCreemMetadataPayload(internal);

    expect(creem).toEqual({
      user_id: 'user_1',
      product_type: 'subscription',
      credits: 100,
    });

    const checkout = {
      id: 'chk_1',
      order: {
        id: 'order_1',
        customer: 'cust_1',
        product: 'prod_1',
        amount: 1000,
        currency: 'USD',
        status: 'paid' as const,
        type: 'one_time' as const,
      },
      product: {
        id: 'prod_1',
        name: 'Test',
        price: 1000,
        currency: 'USD',
        billing_type: 'one_time' as const,
      },
      customer: {
        id: 'cust_1',
        email: 'user@example.com',
        name: 'User',
      },
      metadata: creem,
      status: 'completed' as const,
    } as const;

    const parsed = getMetadataFromCreemCheckout(checkout);

    expect(parsed).toEqual(internal);
  });

  it('prefers subscription metadata when present', () => {
    const checkout = {
      id: 'chk_2',
      order: {
        id: 'order_2',
        customer: 'cust_2',
        product: 'prod_2',
        amount: 1000,
        currency: 'USD',
        status: 'paid' as const,
        type: 'one_time' as const,
      },
      product: {
        id: 'prod_2',
        name: 'Test',
        price: 1000,
        currency: 'USD',
        billing_type: 'one_time' as const,
      },
      customer: {
        id: 'cust_2',
        email: 'user@example.com',
        name: 'User',
      },
      subscription: {
        id: 'sub_1',
        product: 'prod_2',
        customer: 'cust_2',
        status: 'active' as const,
        collection_method: 'charge_automatically' as const,
        metadata: {
          user_id: 'user_sub',
          product_type: 'subscription',
        },
      },
      metadata: {
        user_id: 'user_checkout',
        product_type: 'credits',
      },
      status: 'completed' as const,
    } as const;

    const parsed = getMetadataFromCreemCheckout(checkout);

    expect(parsed).toEqual({
      userId: 'user_sub',
      productType: 'subscription',
      credits: undefined,
    });
  });
});
