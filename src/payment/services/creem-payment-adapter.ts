import { randomUUID } from 'crypto';
import { websiteConfig } from '@/config/website';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes, type PaymentErrorCode } from '@/lib/server/error-codes';
import type {
  CreemCheckout,
  CreemCheckoutMetadata,
  CreemMetadataPayload,
  CreemSubscription,
} from '../creem-types';
import type {
  CheckoutResult,
  CreateCheckoutParams,
  CreateCreditCheckoutParams,
  CreatePortalParams,
  getSubscriptionsParams,
  PaymentProvider,
  PortalResult,
  Subscription,
} from '../types';
import { PaymentTypes } from '../types';
import type { CreemClient } from './creem-client';
import type { SubscriptionQueryService } from './subscription-query-service';

export type CreemPaymentProviderDeps = {
  creemClient: CreemClient;
  subscriptionQueryService: SubscriptionQueryService;
};

/**
 * 将内部领域模型中的 metadata 映射为 Creem API 期望的 snake_case 结构。
 */
export const toCreemMetadataPayload = (
  metadata: CreemCheckoutMetadata
): CreemMetadataPayload => ({
  user_id: metadata.userId,
  product_type: metadata.productType,
  ...(metadata.credits !== undefined ? { credits: metadata.credits } : {}),
});

/**
 * 将调用方提供的原始 metadata 规范化为 Creem 约定的结构。
 *
 * - 能够解析出 userId 时，追加 Creem 约定字段（user_id/product_type/credits）；
 * - 无法解析出 userId 时，直接回退为调用方提供的原始 metadata，而不是丢弃；
 * - 在保留原始 metadata 字段的基础上追加 Creem 约定字段，避免丢失调试所需信息；
 * - 针对积分购买场景，将 string 形式的 credits 转换为 number。
 */
export const toCreemOrderMetadata = (
  metadata: Record<string, string> | undefined,
  productType: CreemCheckoutMetadata['productType']
): Record<string, unknown> | undefined => {
  if (!metadata) {
    return undefined;
  }

  const userId = metadata.userId ?? metadata.user_id;
  if (!userId) {
    return metadata;
  }

  let credits: number | undefined;
  if (productType === 'credits' && metadata.credits !== undefined) {
    const parsed = Number(metadata.credits);
    if (Number.isFinite(parsed)) {
      credits = parsed;
    }
  }

  const internal: CreemCheckoutMetadata = {
    userId,
    productType,
    ...(credits !== undefined ? { credits } : {}),
  };

  return {
    ...metadata,
    ...toCreemMetadataPayload(internal),
  };
};

const fromCreemMetadataPayload = (
  metadata?: Record<string, unknown>
): CreemCheckoutMetadata | null => {
  if (!metadata) {
    return null;
  }

  const rawUserId = (metadata.user_id ?? metadata.userId) as string | undefined;
  const rawProductType = (metadata.product_type ?? metadata.productType) as
    | CreemCheckoutMetadata['productType']
    | undefined;
  const rawCredits = metadata.credits;

  if (!rawUserId || !rawProductType) {
    return null;
  }

  const hasValidCredits =
    typeof rawCredits === 'number' && Number.isFinite(rawCredits);

  if (!hasValidCredits) {
    return {
      userId: rawUserId,
      productType: rawProductType,
    };
  }

  return {
    userId: rawUserId,
    productType: rawProductType,
    credits: rawCredits as number,
  };
};

/**
 * 从 Creem Checkout / Subscription metadata 中提取内部抽象。
 * 优先使用 subscription.metadata（官方会持久化 checkout metadata 到 subscription），
 * 其次回退到 checkout.metadata。
 */
export const getMetadataFromCreemCheckout = (
  checkout: CreemCheckout
): CreemCheckoutMetadata | null => {
  const subscription =
    checkout.subscription && typeof checkout.subscription !== 'string'
      ? (checkout.subscription as CreemSubscription)
      : undefined;

  return (
    fromCreemMetadataPayload(subscription?.metadata) ??
    fromCreemMetadataPayload(checkout.metadata)
  );
};

const resolveCreemPlanProduct = (planId: string, priceId: string) => {
  const config = websiteConfig.payment.creem?.subscriptionProducts;
  const forPlan = config?.[planId];
  const product = forPlan?.[priceId];

  if (!product || !product.productId) {
    throw new DomainError<PaymentErrorCode>({
      code: ErrorCodes.CreemProviderMisconfigured,
      message: `Missing Creem subscriptionProducts mapping for planId="${planId}", priceId="${priceId}"`,
      retryable: false,
    });
  }

  return product;
};

const resolveCreemCreditsProduct = (packageId: string) => {
  const config = websiteConfig.payment.creem;
  const credit = config?.creditProducts?.[packageId];

  if (!credit || !credit.productId) {
    throw new DomainError<PaymentErrorCode>({
      code: ErrorCodes.CreemProviderMisconfigured,
      message: `Missing Creem creditProducts mapping for packageId="${packageId}"`,
      retryable: false,
    });
  }

  return credit;
};

export const buildCreemCheckoutMetadata = (params: {
  rawMetadata: Record<string, string> | undefined;
  productType: CreemCheckoutMetadata['productType'];
}): { metadata?: Record<string, unknown>; requestId: string } => {
  const baseMetadata =
    params.rawMetadata ?? ({} as Record<string, string | undefined>);

  const requestId =
    baseMetadata.request_id ?? baseMetadata.requestId ?? randomUUID();

  const normalized = toCreemOrderMetadata(
    {
      ...baseMetadata,
      request_id: requestId,
    } as Record<string, string>,
    params.productType
  );

  const withProvider = normalized
    ? {
        ...normalized,
        provider_id: 'creem',
      }
    : {
        provider_id: 'creem',
        request_id: requestId,
      };

  return {
    metadata: withProvider,
    requestId,
  };
};

export class CreemPaymentProvider implements PaymentProvider {
  private readonly client: CreemClient;
  private readonly subscriptionQueryService: SubscriptionQueryService;

  constructor(deps: CreemPaymentProviderDeps) {
    if (!deps.creemClient) {
      throw new Error('creemClient is required');
    }
    this.client = deps.creemClient;
    this.subscriptionQueryService = deps.subscriptionQueryService;
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    // TODO: 根据 planId/priceId 与 websiteConfig.payment.creem 进行映射，生成 Creem product/price。
    // 当前阶段仅作为调用骨架，实际映射逻辑在后续 Phase A 步骤中补充。
    const { metadata: creemMetadata, requestId } = buildCreemCheckoutMetadata({
      rawMetadata: params.metadata,
      productType: PaymentTypes.SUBSCRIPTION,
    });

    const result = await this.client.createCheckout({
      productId: resolveCreemPlanProduct(params.planId, params.priceId)
        .productId,
      customerEmail: params.customerEmail,
      requestId,
      ...(creemMetadata ? { metadata: creemMetadata } : {}),
      ...(params.successUrl ? { successUrl: params.successUrl } : {}),
      ...(params.cancelUrl ? { cancelUrl: params.cancelUrl } : {}),
    });

    return {
      url: result.checkoutUrl,
      id: result.checkoutId,
    };
  }

  async createCreditCheckout(
    params: CreateCreditCheckoutParams
  ): Promise<CheckoutResult> {
    const { metadata: creemMetadata, requestId } = buildCreemCheckoutMetadata({
      rawMetadata: params.metadata,
      productType: 'credits',
    });

    const result = await this.client.createCheckout({
      productId: resolveCreemCreditsProduct(params.packageId).productId,
      customerEmail: params.customerEmail,
      requestId,
      ...(creemMetadata ? { metadata: creemMetadata } : {}),
      ...(params.successUrl ? { successUrl: params.successUrl } : {}),
      ...(params.cancelUrl ? { cancelUrl: params.cancelUrl } : {}),
    });

    return {
      url: result.checkoutUrl,
      id: result.checkoutId,
    };
  }

  async createCustomerPortal(
    _params: CreatePortalParams
  ): Promise<PortalResult> {
    return {
      url: 'https://creem.io/my-orders/login',
    };
  }

  async getSubscriptions(
    _params: getSubscriptionsParams
  ): Promise<Subscription[]> {
    return this.subscriptionQueryService.getSubscriptions(_params);
  }
}
