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
 * 1. Next.js middleware
 * https://nextjs.org/docs/app/building-your-application/routing/middleware
 *
 * 2. Better Auth middleware
 * https://www.better-auth.com/docs/integrations/next#middleware
 *
 * In Next.js middleware, it's recommended to only check for the existence of a session cookie
 * to handle redirection. To avoid blocking requests by making API or database calls.
 */
export default async function middleware(req: NextRequest) {
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

  if (hasBetterAuthSessionCookie(req.cookies.getAll())) {
    try {
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
    } catch {
      isLoggedIn = false;
    }
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
