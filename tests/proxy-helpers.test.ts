import { describe, expect, test } from 'vitest';
import {
  buildSafeCallbackUrl,
  evaluateRouteAccess,
  getPathnameWithoutLocale,
  hasBetterAuthSessionCookie,
  normalizePathname,
} from '@/proxy/helpers';
import { Routes } from '@/routes';

describe('proxy helpers', () => {
  test('detects Better Auth session cookies', () => {
    expect(hasBetterAuthSessionCookie([])).toBe(false);
    expect(
      hasBetterAuthSessionCookie([
        { name: '__Secure-better-auth.session_token' },
      ])
    ).toBe(true);
    expect(
      hasBetterAuthSessionCookie([{ name: 'better-auth.session_cache' }])
    ).toBe(true);
    expect(hasBetterAuthSessionCookie([{ name: 'random.session_token' }])).toBe(
      false
    );
  });

  test('strips locale prefixes from pathname', () => {
    expect(getPathnameWithoutLocale('/en/dashboard')).toBe('/dashboard');
    expect(getPathnameWithoutLocale('/zh/auth/login')).toBe('/auth/login');
    expect(getPathnameWithoutLocale('/docs')).toBe('/docs');
  });

  test('normalizes pathnames for comparison', () => {
    expect(normalizePathname('/dashboard/')).toBe('/dashboard');
    expect(normalizePathname('/')).toBe('/');
  });

  test('evaluates route access decisions', () => {
    expect(evaluateRouteAccess(true, Routes.Login)).toBe('redirect-dashboard');
    expect(evaluateRouteAccess(false, Routes.SettingsProfile)).toBe(
      'redirect-login'
    );
    expect(evaluateRouteAccess(true, Routes.SettingsProfile)).toBe('allow');
  });

  test('builds safe callback URLs', () => {
    const base = new URL('https://example.com/ai/text?foo=bar');
    expect(buildSafeCallbackUrl(base)).toBe(
      encodeURIComponent('/ai/text?foo=bar')
    );

    const rootBase = new URL('https://example.com');
    expect(buildSafeCallbackUrl(rootBase)).toBe(encodeURIComponent('/'));
  });

  test('allows relative paths with dot segments', () => {
    const url = new URL('https://example.com/docs/../ai/text?foo=bar');
    expect(buildSafeCallbackUrl(url)).toBe(
      encodeURIComponent('/ai/text?foo=bar')
    );
  });

  test('rejects protocol-relative callback paths', () => {
    const url = new URL('https://example.com//evil.com');
    expect(buildSafeCallbackUrl(url)).toBe(encodeURIComponent(Routes.Login));
  });

  test('rejects absolute URL embedded in path', () => {
    const url = new URL('https://example.com/http://evil.com');
    expect(buildSafeCallbackUrl(url)).toBe(encodeURIComponent(Routes.Login));
  });
});
