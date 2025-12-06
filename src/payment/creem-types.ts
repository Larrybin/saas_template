import type { PaymentType } from './types';

/**
 * Creem 事件类型
 *
 * - 该枚举只覆盖当前集成范围内需要处理的事件；
 * - 具体集合参考 raphael-starterkit 中的 types/creem.ts。
 */
export type CreemEventType =
  | 'checkout.completed'
  | 'refund.created'
  | 'subscription.active'
  | 'subscription.trialing'
  | 'subscription.canceled'
  | 'subscription.paid'
  | 'subscription.expired'
  | 'subscription.unpaid'
  | 'subscription.update';

export interface CreemCustomer {
  id: string;
  email?: string | null;
  name?: string | null;
  country?: string | null;
}

export interface CreemProduct {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  price: number;
  currency: string;
  billing_type: 'recurring' | 'one_time';
  billing_period?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreemSubscription {
  id: string;
  product: string | CreemProduct;
  customer: string | CreemCustomer;
  collection_method?: 'charge_automatically';
  status:
    | 'active'
    | 'canceled'
    | 'expired'
    | 'trialing'
    | 'unpaid'
    | 'past_due'
    | 'incomplete'
    | 'incomplete_expired';
  canceled_at?: string | null;
  current_period_start_date?: string | null;
  current_period_end_date?: string | null;
  created_at?: string;
  updated_at?: string;
  metadata?: CreemMetadataPayload | Record<string, unknown>;
}

/**
 * Creem metadata 原始结构（checkout.metadata / subscription.metadata）
 */
export type CreemMetadataPayload = {
  user_id: string;
  product_type: Extract<PaymentType, 'subscription'> | 'credits';
  credits?: number;
  [key: string]: unknown;
};

export interface CreemOrder {
  id: string;
  customer: string | CreemCustomer;
  product: string | CreemProduct;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed';
  type: 'recurring' | 'one_time';
  created_at?: string;
  updated_at?: string;
}

export interface CreemCheckout {
  id: string;
  request_id?: string;
  order: CreemOrder;
  product: CreemProduct;
  customer: CreemCustomer;
  subscription?: CreemSubscription;
  status: 'completed' | 'pending' | 'failed';
  custom_fields?: unknown[];
  metadata?: CreemMetadataPayload | Record<string, unknown>;
}

export interface CreemWebhookEvent {
  id: string;
  eventType: CreemEventType;
  created_at: number;
  object: CreemCheckout | CreemSubscription | unknown;
  mode?: string;
}

/**
 * 内部使用的 Creem metadata 抽象
 *
 * - 在 Provider 与 Webhook Handler 之间传递；
 * - 字段名采用 camelCase，避免在业务层散落 snake_case 魔法字符串。
 */
export interface CreemCheckoutMetadata {
  userId: string;
  productType: Extract<PaymentType, 'subscription'> | 'credits';
  credits?: number;
}
