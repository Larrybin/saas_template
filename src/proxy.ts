import { getCookieCache } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  LOCALES,
  routing,
} from './i18n/routing';
import {
  buildSafeCallbackUrl,
  evaluateRouteAccess,
  getPathnameWithoutLocale,
  hasBetterAuthSessionCookie,
} from './proxy/helpers';
import { DEFAULT_LOGIN_REDIRECT } from './routes';

const intlMiddleware = createMiddleware(routing);

/**
 * 1. Next.js Proxy
 * https://nextjs.org/docs/app/building-your-application/routing/middleware
 *
 * 2. Better Auth Proxy integration
 * https://www.better-auth.com/docs/integrations/next#middleware
 *
 * In Next.js Proxy，better-auth 支持通过 cookie cache 快速读取会话。
 * 本项目在 Proxy 中遵循以下原则：
 * - 首选使用 `getCookieCache(request)` 从已签名的 cookie cache 中读取 session（不访问数据库）。
 * - 如 cookie cache 未命中，但存在 session cookie，再退回到调用 `/api/auth/get-session` 做完整校验。
 * - 具体受保护操作仍必须在对应 API route / 页面内执行服务端鉴权，Proxy 只负责“乐观重定向”。
 */
export default async function proxy(req: NextRequest) {
  const { nextUrl } = req;
  // Handle internal docs link redirection for internationalization
  // Check if this is a docs page without locale prefix
  if (nextUrl.pathname.startsWith('/docs/') || nextUrl.pathname === '/docs') {
    // Get the user's preferred locale from cookie
    const localeCookie = req.cookies.get(LOCALE_COOKIE_NAME);
    const preferredLocale = localeCookie?.value;

    // If user has a non-default locale preference, redirect to localized version
    if (
      preferredLocale &&
      preferredLocale !== DEFAULT_LOCALE &&
      LOCALES.includes(preferredLocale)
    ) {
      const localizedPath = `/${preferredLocale}${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      return NextResponse.redirect(new URL(localizedPath, nextUrl));
    }
  }

  let isLoggedIn = false;

  try {
    const cachedSession = await getCookieCache(req);
    if (cachedSession) {
      isLoggedIn = true;
    } else if (hasBetterAuthSessionCookie(req.cookies.getAll())) {
      const sessionResponse = await fetch(
        new URL('/api/auth/get-session', nextUrl),
        {
          headers: {
            cookie: req.headers.get('cookie') ?? '',
          },
          cache: 'no-store',
        }
      );

      if (sessionResponse.ok) {
        const sessionData = await sessionResponse.json();
        isLoggedIn = Boolean(sessionData?.data?.session);
      }
    }
  } catch {
    isLoggedIn = false;
  }

  const pathnameWithoutLocale = getPathnameWithoutLocale(nextUrl.pathname);
  const routeDecision = evaluateRouteAccess(isLoggedIn, pathnameWithoutLocale);

  if (routeDecision === 'redirect-dashboard') {
    return NextResponse.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl));
  }

  if (routeDecision === 'redirect-login') {
    const callbackUrl = buildSafeCallbackUrl(nextUrl);
    return NextResponse.redirect(
      new URL(`/auth/login?callbackUrl=${callbackUrl}`, nextUrl)
    );
  }

  // Apply intlMiddleware for all routes
  return intlMiddleware(req);
}
/**
 * Next.js internationalized routing
 * specify the routes the middleware applies to
 *
 * https://next-intl.dev/docs/routing#base-path
 */
export const config = {
  // The `matcher` is relative to the `basePath`
  matcher: [
    // Match all pathnames except for
    // - if they start with `/api`, `/_next` or `/_vercel`
    // - if they contain a dot (e.g. `favicon.ico`)
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
};
