import { serverEnv } from '@/env/server';
import { createCreemPaymentProviderFromEnv } from './services/creem-payment-factory';
import {
  createStripePaymentProviderFromEnv,
  type StripeProviderOverrides,
} from './services/stripe-payment-factory';
import type {
  PaymentContext,
  PaymentProvider,
  PaymentProviderFactory,
} from './types';

export const CREEM_PHASE_GATE_ERROR_MESSAGE =
  "Payment provider 'creem' is not yet implemented. See .codex/plan/creem-payment-integration.md (Phase A) and docs/governance-index.md for current status and usage constraints.";

/**
 * 默认的 PaymentProviderFactory 实现
 *
 * - 当前仅支持 Stripe；
 * - 未来接入其它 Provider（例如 'creem'）时，只需要在 getProvider 中追加分支；
 * - 多租户/多 Region 等场景可通过扩展 PaymentContext 再引入，不在本轮预先实现。
 */
export class DefaultPaymentProviderFactory implements PaymentProviderFactory {
  private stripeProvider?: PaymentProvider;
  private creemProvider?: PaymentProvider;
  private readonly overrides: StripeProviderOverrides | undefined;

  constructor(overrides?: StripeProviderOverrides) {
    this.overrides = overrides;
  }

  private createStripeProviderFromEnv(): PaymentProvider {
    return createStripePaymentProviderFromEnv(
      {
        stripeSecretKey:
          this.overrides?.stripeSecretKey ?? serverEnv.stripeSecretKey,
        stripeWebhookSecret:
          this.overrides?.stripeWebhookSecret ?? serverEnv.stripeWebhookSecret,
      },
      {
        stripeSecretKey: this.overrides?.stripeSecretKey,
        stripeWebhookSecret: this.overrides?.stripeWebhookSecret,
      }
    );
  }

  private createCreemProviderFromEnv(): PaymentProvider {
    return createCreemPaymentProviderFromEnv();
  }

  getProvider(ctx?: PaymentContext): PaymentProvider {
    // 调用方传入的 providerId 作为唯一“真值来源”，未传入时默认回退为 'stripe'
    const providerId = ctx?.providerId ?? 'stripe';

    switch (providerId) {
      case 'stripe': {
        if (!this.stripeProvider) {
          this.stripeProvider = this.createStripeProviderFromEnv();
        }
        return this.stripeProvider;
      }
      case 'creem': {
        // Phase Gate：在生产环境仍禁止启用 Creem，避免未完成集成被误用
        if (process.env.NODE_ENV === 'production') {
          throw new Error(CREEM_PHASE_GATE_ERROR_MESSAGE);
        }

        if (!this.creemProvider) {
          this.creemProvider = this.createCreemProviderFromEnv();
        }

        return this.creemProvider;
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
