import { z } from 'zod';
import { maskEnvSnapshot } from './utils';

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const booleanString = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true');

const emailString = z
  .string()
  .min(1, 'Mail sender is required')
  .refine((value) => {
    const trimmed = value.trim();
    if (trimmed.includes('<') && trimmed.endsWith('>')) {
      const match = /<([^>]+)>$/.exec(trimmed);
      if (!match) {
        return false;
      }
      return z.string().email().safeParse(match[1].trim()).success;
    }

    return z.string().email().safeParse(trimmed).success;
  }, 'Must be a valid email address, optionally formatted as "Name <mail@domain>"');

const clientSchemaInput = z.object({
  NEXT_PUBLIC_BASE_URL: z
    .string()
    .url('NEXT_PUBLIC_BASE_URL must be a valid URL'),
  NEXT_PUBLIC_DEMO_WEBSITE: booleanString,
  NEXT_PUBLIC_MAIL_FROM_EMAIL: emailString,
  NEXT_PUBLIC_MAIL_SUPPORT_EMAIL: emailString,
  NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY: optionalString,
  NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY: optionalString,
  NEXT_PUBLIC_STRIPE_PRICE_LIFETIME: optionalString,
  NEXT_PUBLIC_STRIPE_PRICE_CREDITS_BASIC: optionalString,
  NEXT_PUBLIC_STRIPE_PRICE_CREDITS_STANDARD: optionalString,
  NEXT_PUBLIC_STRIPE_PRICE_CREDITS_PREMIUM: optionalString,
  NEXT_PUBLIC_STRIPE_PRICE_CREDITS_ENTERPRISE: optionalString,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: optionalString,
  NEXT_PUBLIC_GOOGLE_ANALYTICS_ID: optionalString,
  NEXT_PUBLIC_UMAMI_WEBSITE_ID: optionalString,
  NEXT_PUBLIC_UMAMI_SCRIPT: optionalString,
  NEXT_PUBLIC_OPENPANEL_CLIENT_ID: optionalString,
  NEXT_PUBLIC_PLAUSIBLE_DOMAIN: optionalString,
  NEXT_PUBLIC_PLAUSIBLE_SCRIPT: optionalString,
  NEXT_PUBLIC_AHREFS_WEBSITE_ID: optionalString,
  NEXT_PUBLIC_SELINE_TOKEN: optionalString,
  NEXT_PUBLIC_DATAFAST_WEBSITE_ID: optionalString,
  NEXT_PUBLIC_DATAFAST_DOMAIN: optionalString,
  NEXT_PUBLIC_AFFILIATE_AFFONSO_ID: optionalString,
  NEXT_PUBLIC_AFFILIATE_PROMOTEKIT_ID: optionalString,
  NEXT_PUBLIC_CRISP_WEBSITE_ID: optionalString,
});

const clientSchema = clientSchemaInput.transform((value) => ({
  baseUrl: value.NEXT_PUBLIC_BASE_URL,
  isDemoWebsite: value.NEXT_PUBLIC_DEMO_WEBSITE ?? false,
  mail: {
    from: value.NEXT_PUBLIC_MAIL_FROM_EMAIL,
    support: value.NEXT_PUBLIC_MAIL_SUPPORT_EMAIL,
  },
  stripePriceIds: {
    proMonthly: value.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY,
    proYearly: value.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY,
    lifetime: value.NEXT_PUBLIC_STRIPE_PRICE_LIFETIME,
    creditsBasic: value.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_BASIC,
    creditsStandard: value.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_STANDARD,
    creditsPremium: value.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_PREMIUM,
    creditsEnterprise: value.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_ENTERPRISE,
  },
  turnstileSiteKey: value.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  analytics: {
    googleAnalyticsId: value.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID,
    umami: {
      websiteId: value.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
      scriptUrl: value.NEXT_PUBLIC_UMAMI_SCRIPT,
    },
    openPanelClientId: value.NEXT_PUBLIC_OPENPANEL_CLIENT_ID,
    plausible: {
      domain: value.NEXT_PUBLIC_PLAUSIBLE_DOMAIN,
      scriptUrl: value.NEXT_PUBLIC_PLAUSIBLE_SCRIPT,
    },
    ahrefsWebsiteId: value.NEXT_PUBLIC_AHREFS_WEBSITE_ID,
    selineToken: value.NEXT_PUBLIC_SELINE_TOKEN,
    dataFast: {
      websiteId: value.NEXT_PUBLIC_DATAFAST_WEBSITE_ID,
      domain: value.NEXT_PUBLIC_DATAFAST_DOMAIN,
    },
  },
  affiliates: {
    affonsoId: value.NEXT_PUBLIC_AFFILIATE_AFFONSO_ID,
    promotekitId: value.NEXT_PUBLIC_AFFILIATE_PROMOTEKIT_ID,
  },
  crispWebsiteId: value.NEXT_PUBLIC_CRISP_WEBSITE_ID,
}));

type ClientEnvShape = {
  [K in keyof z.input<typeof clientSchemaInput>]: string | undefined;
};

// Use explicit property access so Next.js can inline values at build time.
const rawClientEnv = {
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
  NEXT_PUBLIC_DEMO_WEBSITE: process.env.NEXT_PUBLIC_DEMO_WEBSITE,
  NEXT_PUBLIC_MAIL_FROM_EMAIL: process.env.NEXT_PUBLIC_MAIL_FROM_EMAIL,
  NEXT_PUBLIC_MAIL_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_MAIL_SUPPORT_EMAIL,
  NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY:
    process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY,
  NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY:
    process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY,
  NEXT_PUBLIC_STRIPE_PRICE_LIFETIME:
    process.env.NEXT_PUBLIC_STRIPE_PRICE_LIFETIME,
  NEXT_PUBLIC_STRIPE_PRICE_CREDITS_BASIC:
    process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_BASIC,
  NEXT_PUBLIC_STRIPE_PRICE_CREDITS_STANDARD:
    process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_STANDARD,
  NEXT_PUBLIC_STRIPE_PRICE_CREDITS_PREMIUM:
    process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_PREMIUM,
  NEXT_PUBLIC_STRIPE_PRICE_CREDITS_ENTERPRISE:
    process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_ENTERPRISE,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  NEXT_PUBLIC_GOOGLE_ANALYTICS_ID: process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID,
  NEXT_PUBLIC_UMAMI_WEBSITE_ID: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
  NEXT_PUBLIC_UMAMI_SCRIPT: process.env.NEXT_PUBLIC_UMAMI_SCRIPT,
  NEXT_PUBLIC_OPENPANEL_CLIENT_ID: process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID,
  NEXT_PUBLIC_PLAUSIBLE_DOMAIN: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN,
  NEXT_PUBLIC_PLAUSIBLE_SCRIPT: process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT,
  NEXT_PUBLIC_AHREFS_WEBSITE_ID: process.env.NEXT_PUBLIC_AHREFS_WEBSITE_ID,
  NEXT_PUBLIC_SELINE_TOKEN: process.env.NEXT_PUBLIC_SELINE_TOKEN,
  NEXT_PUBLIC_DATAFAST_WEBSITE_ID: process.env.NEXT_PUBLIC_DATAFAST_WEBSITE_ID,
  NEXT_PUBLIC_DATAFAST_DOMAIN: process.env.NEXT_PUBLIC_DATAFAST_DOMAIN,
  NEXT_PUBLIC_AFFILIATE_AFFONSO_ID:
    process.env.NEXT_PUBLIC_AFFILIATE_AFFONSO_ID,
  NEXT_PUBLIC_AFFILIATE_PROMOTEKIT_ID:
    process.env.NEXT_PUBLIC_AFFILIATE_PROMOTEKIT_ID,
  NEXT_PUBLIC_CRISP_WEBSITE_ID: process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID,
} satisfies ClientEnvShape;

const parsedClientEnv = clientSchema.safeParse(rawClientEnv);

if (!parsedClientEnv.success) {
  console.error('❌ Invalid client environment variables:', {
    issues: parsedClientEnv.error.format(),
    snapshot: maskEnvSnapshot(rawClientEnv, { revealLength: true }),
  });
  throw new Error('Invalid client environment variables');
}

export const clientEnv = parsedClientEnv.data;

export type ClientEnv = typeof clientEnv;
