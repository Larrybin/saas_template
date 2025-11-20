import { createHash } from 'crypto';
import type Stripe from 'stripe';

const SUPPORTED_LOCALES: Stripe.Checkout.SessionCreateParams.Locale[] = [
  'auto',
  'bg',
  'cs',
  'da',
  'de',
  'el',
  'en',
  'es',
  'et',
  'fi',
  'fr',
  'hu',
  'id',
  'it',
  'ja',
  'ko',
  'lt',
  'lv',
  'ms',
  'mt',
  'nb',
  'nl',
  'pl',
  'pt',
  'ro',
  'ru',
  'sk',
  'sl',
  'sv',
  'th',
  'tr',
  'vi',
  'zh',
];

export function createIdempotencyKey(
  operation: string,
  data: Record<string, unknown>
): string {
  const hash = createHash('sha256');
  hash.update(operation);
  hash.update(JSON.stringify(data));
  return hash.digest('hex');
}

export function mapLocaleToStripeLocale(
  locale?: string
): Stripe.Checkout.SessionCreateParams.Locale {
  if (!locale) return 'auto';
  const localeCandidate = locale as Stripe.Checkout.SessionCreateParams.Locale;
  if (SUPPORTED_LOCALES.includes(localeCandidate)) {
    return localeCandidate;
  }
  const base = locale.split('-')[0];
  const baseCandidate = base as Stripe.Checkout.SessionCreateParams.Locale;
  if (SUPPORTED_LOCALES.includes(baseCandidate)) {
    return baseCandidate;
  }
  return 'auto';
}

export function sanitizeMetadata(
  metadata?: Record<string, string>
): Record<string, string> {
  if (!metadata) return {};
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value !== 'string') continue;
    if (!/^[A-Za-z0-9_.:-]{1,40}$/.test(key)) continue;
    sanitized[key] = value.slice(0, 500);
  }
  return sanitized;
}
