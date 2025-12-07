import { creem } from '@creem_io/better-auth';
import type { BetterAuthPlugin } from 'better-auth';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { admin } from 'better-auth/plugins';
import { parse as parseCookies } from 'cookie';
import type { Locale } from 'next-intl';
import { getDb } from '@/db/index';
import { serverEnv } from '@/env/server';
import { defaultMessages } from '@/i18n/messages';
import { LOCALE_COOKIE_NAME, routing } from '@/i18n/routing';
import { handleAuthUserCreated } from '@/lib/server/auth-user-lifecycle';
import { sendEmail } from '@/mail';
import './server/auth-access-provider';
import { isCreemBetterAuthEnabled } from './server/creem-config';
import { getBaseUrl, getUrlWithLocaleInCallbackUrl } from './urls/urls';

/**
 * Better Auth configuration
 *
 * docs:
 * https://mksaas.com/docs/auth
 * https://www.better-auth.com/docs/reference/options
 */
const githubProvider =
  serverEnv.oauth.github.clientId && serverEnv.oauth.github.clientSecret
    ? {
        clientId: serverEnv.oauth.github.clientId,
        clientSecret: serverEnv.oauth.github.clientSecret,
      }
    : undefined;

const googleProvider =
  serverEnv.oauth.google.clientId && serverEnv.oauth.google.clientSecret
    ? {
        clientId: serverEnv.oauth.google.clientId,
        clientSecret: serverEnv.oauth.google.clientSecret,
      }
    : undefined;

const creemPlugin: BetterAuthPlugin | undefined =
  isCreemBetterAuthEnabled && serverEnv.creemApiKey
    ? (creem({
        apiKey: serverEnv.creemApiKey,
        webhookSecret: serverEnv.creemWebhookSecret,
        persistSubscriptions: true,
        testMode: process.env.NODE_ENV !== 'production',
      }) as unknown as BetterAuthPlugin)
    : undefined;

export const auth = betterAuth({
  baseURL: getBaseUrl(),
  appName: defaultMessages.Metadata.name,
  database: drizzleAdapter(await getDb(), {
    provider: 'pg', // or "mysql", "sqlite"
  }),
  session: {
    /**
     * Session cookies:
     * - In production Better Auth issues httpOnly + secure + SameSite=Lax cookies by default,
     *   as long as baseURL is HTTPS.
     * - All protected actions/pages must validate the session on the server; cookie existence
     *   alone must never be treated as sufficient authentication.
     */
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
    sendVerificationEmail: async ({ user, url }, request) => {
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
    ...(githubProvider && { github: githubProvider }),
    ...(googleProvider && { google: googleProvider }),
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
  /**
   * Payment / Billing / Credits remain the single source of truth
   * for commercial state (plans, memberships, credits).
   *
   * Better Auth and its plugins (including the Creem plugin) may
   * project or cache access views for the current user, but must
   * not be treated as an independent billing ledger.
   */
  databaseHooks: {
    // https://www.better-auth.com/docs/concepts/database#database-hooks
    user: {
      create: {
        after: async (user) => {
          await handleAuthUserCreated({
            id: user.id,
            email: user.email,
            name: user.name,
          });
        },
      },
    },
  },
  plugins: [
    ...(creemPlugin ? [creemPlugin] : []),
    // https://www.better-auth.com/docs/plugins/admin
    // support user management, ban/unban user, manage user roles, etc.
    admin({
      // https://www.better-auth.com/docs/plugins/admin#default-ban-reason
      // defaultBanReason: 'Spamming',
      bannedUserMessage:
        'You have been banned from this application. Please contact support if you believe this is an error.',
    }) as unknown as BetterAuthPlugin,
  ],
  onAPIError: {
    // https://www.better-auth.com/docs/reference/options#onapierror
    errorURL: '/auth/error',
    onError: (error, ctx) => {
      const baseContext = {
        path: (ctx as { path?: string } | undefined)?.path,
        method: (ctx as { request?: { method?: string } } | undefined)?.request
          ?.method,
        requestId: (ctx as { requestId?: string } | undefined)?.requestId,
      };

      if (error instanceof APIError) {
        const safeError = {
          name: error.name,
          message: error.message,
          status: error.status,
          // 部分 better-auth 错误实现会附带 code 字段
          code: (error as { code?: string }).code,
          ...baseContext,
        };

        // 仅记录必要字段，避免在日志中泄露 token、内部 ID 等敏感信息
        console.error('auth api error:', safeError);
        return;
      }

      if (error instanceof Error) {
        const safeError = {
          name: error.name,
          message: error.message,
          ...baseContext,
        };

        // 仅记录必要字段，避免在日志中泄露 token、内部 ID 等敏感信息
        console.error('auth error:', safeError);
        return;
      }

      // 非 Error 类型的异常值（如字符串、未知对象），仅作为 opaque 值记录
      console.error('auth non-error thrown:', {
        value: error,
        ...baseContext,
      });
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
