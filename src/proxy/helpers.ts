import { LOCALES } from '@/i18n/routing';
import {
  protectedRoutes,
  routesNotAllowedByLoggedInUsers,
  Routes,
} from '@/routes';

export const SESSION_COOKIE_SUFFIXES = [
  'better-auth.session_token',
  'better-auth.session_cache',
];

export function hasBetterAuthSessionCookie(
  cookies: ReadonlyArray<{ name: string }>
): boolean {
  if (cookies.length === 0) {
    return false;
  }

  return cookies.some(({ name }) =>
    SESSION_COOKIE_SUFFIXES.some(
      (suffix) =>
        name === suffix || name.endsWith(`.${suffix}`) || name.endsWith(suffix)
    )
  );
}

const localePattern = LOCALES.length
  ? new RegExp(`^/(${LOCALES.join('|')})(/|$)`)
  : null;

export function getPathnameWithoutLocale(pathname: string): string {
  if (!localePattern) {
    return pathname;
  }

  return pathname.replace(localePattern, '/');
}

export function normalizePathname(pathname: string): string {
  if (pathname === '/') {
    return pathname;
  }

  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

const protectedRouteSet = new Set(
  protectedRoutes.map((route) => normalizePathname(route))
);
const disallowedWhenLoggedInRouteSet = new Set(
  routesNotAllowedByLoggedInUsers.map((route) => normalizePathname(route))
);

export type RouteDecision = 'allow' | 'redirect-login' | 'redirect-dashboard';

export function evaluateRouteAccess(
  isLoggedIn: boolean,
  pathname: string
): RouteDecision {
  const normalizedPath = normalizePathname(pathname);

  if (isLoggedIn && disallowedWhenLoggedInRouteSet.has(normalizedPath)) {
    return 'redirect-dashboard';
  }

  if (!isLoggedIn && protectedRouteSet.has(normalizedPath)) {
    return 'redirect-login';
  }

  return 'allow';
}

/**
 * 判断当前路径是否需要通过会话 API 进行登录状态检查。
 *
 * - 仅对受保护路由执行昂贵的会话检查，以减少对公共/营销页面的多余请求。
 * - 路由是否受保护的来源统一使用 protectedRoutes，避免在多个地方硬编码路径。
 */
export function shouldCheckSession(pathname: string): boolean {
  const normalizedPath = normalizePathname(pathname);

  return (
    protectedRouteSet.has(normalizedPath) ||
    disallowedWhenLoggedInRouteSet.has(normalizedPath)
  );
}

type CallbackPathClassification =
  | { safe: true; reason?: undefined }
  | { safe: false; reason: string };

function classifyCallbackPath(path: string): CallbackPathClassification {
  if (!path.startsWith('/')) {
    return { safe: false, reason: 'non-absolute-path' };
  }
  if (path.startsWith('//')) {
    return { safe: false, reason: 'protocol-relative-url' };
  }
  if (/^\/https?:\/\//i.test(path)) {
    return { safe: false, reason: 'absolute-url-in-path' };
  }
  return { safe: true };
}

export function buildSafeCallbackUrl(nextUrl: URL): string {
  const originalPath =
    nextUrl.pathname + (nextUrl.search ? nextUrl.search : '');

  let callbackPath = originalPath;

  const classification = classifyCallbackPath(callbackPath);
  if (!classification.safe) {
    // Middleware 运行在 Edge 环境，不能依赖 server-only logger。
    // 使用 console.warn 输出结构化日志，方便在平台侧聚合。
    // eslint-disable-next-line no-console
    console.warn('Rejected unsafe callback path', {
      reason: classification.reason,
      originalPath,
    });
    callbackPath = Routes.Login;
  }

  return encodeURIComponent(callbackPath);
}
