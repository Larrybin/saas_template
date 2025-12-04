import { serverEnv } from '@/env/server';
import {
  createStripePaymentProviderFromEnv,
  type StripeProviderOverrides,
} from './services/stripe-payment-factory';
import type {
  PaymentContext,
  PaymentProvider,
  PaymentProviderFactory,
} from './types';

/**
 * 默认的 PaymentProviderFactory 实现
 *
 * - 当前仅支持 Stripe；
 * - 未来接入其它 Provider（例如 'creem'）时，只需要在 getProvider 中追加分支；
 * - 多租户/多 Region 等场景可通过扩展 PaymentContext 再引入，不在本轮预先实现。
 */
export class DefaultPaymentProviderFactory implements PaymentProviderFactory {
  private readonly stripeProvider: PaymentProvider;

  constructor(overrides?: StripeProviderOverrides) {
    this.stripeProvider = createStripePaymentProviderFromEnv(
      {
        stripeSecretKey:
          overrides?.stripeSecretKey ?? serverEnv.stripeSecretKey,
        stripeWebhookSecret:
          overrides?.stripeWebhookSecret ?? serverEnv.stripeWebhookSecret,
      },
      {
        stripeSecretKey: overrides?.stripeSecretKey,
        stripeWebhookSecret: overrides?.stripeWebhookSecret,
      }
    );
  }

  getProvider(ctx?: PaymentContext): PaymentProvider {
    // 调用方传入的 providerId 作为唯一“真值来源”，未传入时默认回退为 'stripe'
    const providerId = ctx?.providerId ?? 'stripe';

    switch (providerId) {
      case 'stripe': {
        return this.stripeProvider;
      }
      default: {
        throw new Error(`Unsupported payment provider: ${providerId}`);
      }
    }
  }
}

/**
 * 默认全局 PaymentProviderFactory 实例
 *
 * - 对于当前单 Provider（Stripe）的场景，直接复用该实例；
 * - 未来如需按 workspace/project 注入不同 overrides，可在更高层构造其它 factory 实例。
 */
export const paymentProviderFactory = new DefaultPaymentProviderFactory();
