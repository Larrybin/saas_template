import { websiteConfig } from '@/config/website';
import {
  addMonthlyFreeCredits,
  addRegisterGiftCredits,
} from '@/credits/credits';
import { getDb } from '@/db/index';
import { defaultMessages } from '@/i18n/messages';
import { LOCALE_COOKIE_NAME, routing } from '@/i18n/routing';
import { sendEmail } from '@/mail';
import { subscribe } from '@/newsletter';
import { type User, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { parse as parseCookies } from 'cookie';
import type { Locale } from 'next-intl';
import { getAllPricePlans } from './price-plan';
import { getBaseUrl, getUrlWithLocaleInCallbackUrl } from './urls/urls';

/**
 * Better Auth configuration
 *
 * docs:
 * https://mksaas.com/docs/auth
 * https://www.better-auth.com/docs/reference/options
 */
export const auth = betterAuth({
  baseURL: getBaseUrl(),
  appName: defaultMessages.Metadata.name,
  database: drizzleAdapter(await getDb(), {
    provider: 'pg', // or "mysql", "sqlite"
  }),
  session: {
    // https://www.better-auth.com/docs/concepts/session-management#cookie-cache
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60, // Cache duration in seconds
    },
    // https://www.better-auth.com/docs/concepts/session-management#session-expiration
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    // https://www.better-auth.com/docs/concepts/session-management#session-freshness
    // https://www.better-auth.com/docs/concepts/users-accounts#authentication-requirements
    // disable freshness check for user deletion
    freshAge: 0 /* 60 * 60 * 24 */,
  },
  emailAndPassword: {
    enabled: true,
    // https://www.better-auth.com/docs/concepts/email#2-require-email-verification
    requireEmailVerification: true,
    // https://www.better-auth.com/docs/authentication/email-password#forget-password
    async sendResetPassword({ user, url }, request) {
      const locale = getLocaleFromRequest(request);
      const localizedUrl = getUrlWithLocaleInCallbackUrl(url, locale);

      await sendEmail({
        to: user.email,
        template: 'forgotPassword',
        context: {
          url: localizedUrl,
          name: user.name,
        },
        locale,
      });
    },
  },
  emailVerification: {
    // https://www.better-auth.com/docs/concepts/email#auto-signin-after-verification
    autoSignInAfterVerification: true,
    // https://www.better-auth.com/docs/authentication/email-password#require-email-verification
    sendVerificationEmail: async ({ user, url, token }, request) => {
      const locale = getLocaleFromRequest(request);
      const localizedUrl = getUrlWithLocaleInCallbackUrl(url, locale);

      await sendEmail({
        to: user.email,
        template: 'verifyEmail',
        context: {
          url: localizedUrl,
          name: user.name,
        },
        locale,
      });
    },
  },
  socialProviders: {
    // https://www.better-auth.com/docs/authentication/github
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    // https://www.better-auth.com/docs/authentication/google
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  account: {
    // https://www.better-auth.com/docs/concepts/users-accounts#account-linking
    accountLinking: {
      enabled: true,
      trustedProviders: ['google', 'github'],
    },
  },
  user: {
    // https://www.better-auth.com/docs/concepts/database#extending-core-schema
    additionalFields: {
      customerId: {
        type: 'string',
        required: false,
      },
    },
    // https://www.better-auth.com/docs/concepts/users-accounts#delete-user
    deleteUser: {
      enabled: true,
    },
  },
  databaseHooks: {
    // https://www.better-auth.com/docs/concepts/database#database-hooks
    user: {
      create: {
        after: async (user) => {
          await onCreateUser(user);
        },
      },
    },
  },
  plugins: [
    // https://www.better-auth.com/docs/plugins/admin
    // support user management, ban/unban user, manage user roles, etc.
    admin({
      // https://www.better-auth.com/docs/plugins/admin#default-ban-reason
      // defaultBanReason: 'Spamming',
      defaultBanExpiresIn: undefined,
      bannedUserMessage:
        'You have been banned from this application. Please contact support if you believe this is an error.',
    }),
  ],
  onAPIError: {
    // https://www.better-auth.com/docs/reference/options#onapierror
    errorURL: '/auth/error',
    onError: (error, ctx) => {
      console.error('auth error:', error);
    },
  },
});

/**
 * Gets the locale from a request by parsing the cookies
 * If no locale is found in the cookies, returns the default locale
 *
 * @param request - The request to get the locale from
 * @returns The locale from the request or the default locale
 */
export function getLocaleFromRequest(request?: Request): Locale {
  const cookies = parseCookies(request?.headers.get('cookie') ?? '');
  return (cookies[LOCALE_COOKIE_NAME] as Locale) ?? routing.defaultLocale;
}

/**
 * On create user hook
 *
 * @param user - The user to create
 */
async function onCreateUser(user: User) {
  // Auto subscribe user to newsletter after sign up if enabled in website config
  // Add a delay to avoid hitting Resend's 1 email per second limit
  if (
    user.email &&
    websiteConfig.newsletter.enable &&
    websiteConfig.newsletter.autoSubscribeAfterSignUp
  ) {
    // Delay newsletter subscription by 2 seconds to avoid rate limiting
    // This ensures the email verification email is sent first
    // Using 2 seconds instead of 1 to provide extra buffer for network delays
    setTimeout(async () => {
      try {
        const subscribed = await subscribe(user.email);
        if (!subscribed) {
          console.error(`Failed to subscribe user ${user.email} to newsletter`);
        } else {
          console.log(`User ${user.email} subscribed to newsletter`);
        }
      } catch (error) {
        console.error('Newsletter subscription error:', error);
      }
    }, 2000);
  }

  // Add register gift credits to the user if enabled in website config
  if (
    websiteConfig.credits.enableCredits &&
    websiteConfig.credits.registerGiftCredits.enable &&
    websiteConfig.credits.registerGiftCredits.amount > 0
  ) {
    try {
      await addRegisterGiftCredits(user.id);
      console.log(`added register gift credits for user ${user.id}`);
    } catch (error) {
      console.error('Register gift credits error:', error);
    }
  }

  // Add free monthly credits to the user if enabled in website config
  if (websiteConfig.credits.enableCredits) {
    const pricePlans = getAllPricePlans();
    // NOTICE: make sure the free plan is not disabled and has credits enabled
    const freePlan = pricePlans.find(
      (plan) => plan.isFree && !plan.disabled && plan.credits?.enable
    );
    if (freePlan) {
      try {
        await addMonthlyFreeCredits(user.id, freePlan.id);
        console.log(`added Free monthly credits for user ${user.id}`);
      } catch (error) {
        console.error('Free monthly credits error:', error);
      }
    }
  }
}
