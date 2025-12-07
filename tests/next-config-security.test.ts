import { describe, expect, it } from 'vitest';
import { createSecurityHeaders } from '../next.config';

const getHeaderValue = (
  headers: { key: string; value: string }[],
  key: string
) => headers.find((header) => header.key === key)?.value ?? '';

describe('createSecurityHeaders', () => {
  it('includes core security headers in development', () => {
    const headers = createSecurityHeaders(true, false);

    const csp = getHeaderValue(headers, 'Content-Security-Policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("'unsafe-eval'");

    expect(getHeaderValue(headers, 'X-Content-Type-Options')).toBe('nosniff');
    expect(getHeaderValue(headers, 'Referrer-Policy')).toBe(
      'strict-origin-when-cross-origin'
    );
    expect(getHeaderValue(headers, 'Permissions-Policy')).toContain(
      'camera=()'
    );
    expect(getHeaderValue(headers, 'X-Frame-Options')).toBe('DENY');

    const hsts = getHeaderValue(headers, 'Strict-Transport-Security');
    expect(hsts).toBe('');
  });

  it('includes HSTS and omits unsafe-eval in production', () => {
    const headers = createSecurityHeaders(false, true);

    const csp = getHeaderValue(headers, 'Content-Security-Policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");

    const hsts = getHeaderValue(headers, 'Strict-Transport-Security');
    expect(hsts).toBe('max-age=63072000; includeSubDomains; preload');
  });
});
