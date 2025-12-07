'use server';

import { getLocale } from 'next-intl/server';
import { getCreditPackageById } from '@/credits/server';
import type { StartSubscriptionCheckoutInput } from '@/domain/billing';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getUrlWithLocale } from '@/lib/urls/urls';
import type { CreateCreditCheckoutParams } from '@/payment/types';
import { Routes } from '@/routes';
import { attachDatafastMetadata } from './datafast-metadata';

type SubscriptionCheckoutArgs = {
  planId: string;
  priceId: string;
  metadata?: Record<string, string> | undefined;
  customerEmail: string;
  userId: string;
  userName?: string | null;
  fallbackName?: string;
};

type CreditCheckoutArgs = {
  packageId: string;
  priceId: string;
  metadata?: Record<string, string> | undefined;
  customerEmail: string;
  userId: string;
  userName?: string | null;
  fallbackName?: string;
};

const withUserMetadata = (
  metadata: Record<string, string> | undefined,
  userId: string,
  userName?: string | null,
  fallbackName?: string
): Record<string, string> => {
  const resolvedName = userName?.trim() || fallbackName?.trim();

  return {
    ...(metadata ?? {}),
    userId,
    ...(resolvedName ? { userName: resolvedName } : {}),
  };
};

export const buildSubscriptionCheckoutParams = async (
  args: SubscriptionCheckoutArgs
): Promise<StartSubscriptionCheckoutInput> => {
  const locale = await getLocale();
  const baseMetadata = withUserMetadata(
    args.metadata,
    args.userId,
    args.userName,
    args.fallbackName ?? args.customerEmail
  );
  const customMetadata = await attachDatafastMetadata(baseMetadata);
  const successUrl = getUrlWithLocale(
    `${Routes.SettingsBilling}?session_id={CHECKOUT_SESSION_ID}`,
    locale
  );
  const cancelUrl = getUrlWithLocale(Routes.Pricing, locale);

  return {
    planId: args.planId,
    priceId: args.priceId,
    customerEmail: args.customerEmail,
    metadata: customMetadata,
    successUrl,
    cancelUrl,
    locale,
  };
};

export const buildCreditCheckoutParams = async (
  args: CreditCheckoutArgs
): Promise<CreateCreditCheckoutParams> => {
  const locale = await getLocale();
  const creditPackage = getCreditPackageById(args.packageId);
  if (!creditPackage) {
    throw new DomainError({
      code: ErrorCodes.CreditsInvalidPayload,
      message: 'Credit package not found',
      retryable: false,
    });
  }

  const baseMetadata = withUserMetadata(
    args.metadata,
    args.userId,
    args.userName,
    args.fallbackName ?? args.customerEmail
  );
  const metadataWithCredits = {
    ...baseMetadata,
    type: 'credit_purchase',
    packageId: args.packageId,
    credits: creditPackage.amount.toString(),
  };
  const customMetadata = await attachDatafastMetadata(metadataWithCredits);

  const successUrl = getUrlWithLocale(
    `${Routes.SettingsCredits}?credits_session_id={CHECKOUT_SESSION_ID}`,
    locale
  );
  const cancelUrl = getUrlWithLocale(Routes.SettingsCredits, locale);

  return {
    packageId: args.packageId,
    priceId: args.priceId,
    customerEmail: args.customerEmail,
    metadata: customMetadata,
    successUrl,
    cancelUrl,
    locale,
  };
};
