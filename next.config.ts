import { createMDX } from 'fumadocs-mdx/next';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { imageOptimizationConfig } from './src/config/images';
import { serverEnv } from './src/env/server';

const emptyTurbopackLoader = require.resolve(
  'next/dist/build/webpack/loaders/empty-loader'
);

const turbopackIgnorePatterns = [
  // CI / build logs show paths starting with \"./node_modules/...\", so we
  // include both forms to be robust across environments.
  './node_modules/.pnpm/thread-stream@*/node_modules/thread-stream/test/**/*',
  './node_modules/.pnpm/thread-stream@*/node_modules/thread-stream/**/*.test.js',
  './node_modules/.pnpm/thread-stream@*/node_modules/thread-stream/**/*.test.mjs',
  './node_modules/.pnpm/thread-stream@*/node_modules/thread-stream/**/*.test.ts',
  './node_modules/.pnpm/thread-stream@*/node_modules/thread-stream/**/*.zip',
  './node_modules/.pnpm/thread-stream@*/node_modules/thread-stream/**/*.sh',
  './node_modules/.pnpm/thread-stream@*/node_modules/thread-stream/yarnrc.yml',
  './node_modules/.pnpm/thread-stream@*/node_modules/thread-stream/LICENSE',
  './node_modules/.pnpm/thread-stream@*/node_modules/thread-stream/bench.js',
  'node_modules/.pnpm/thread-stream@*/node_modules/thread-stream/test/**/*',
  'node_modules/.pnpm/thread-stream@*/node_modules/thread-stream/**/*.test.js',
  'node_modules/.pnpm/thread-stream@*/node_modules/thread-stream/**/*.test.mjs',
  'node_modules/.pnpm/thread-stream@*/node_modules/thread-stream/**/*.test.ts',
  'node_modules/.pnpm/thread-stream@*/node_modules/thread-stream/**/*.zip',
  'node_modules/.pnpm/thread-stream@*/node_modules/thread-stream/**/*.sh',
  'node_modules/.pnpm/thread-stream@*/node_modules/thread-stream/yarnrc.yml',
  'node_modules/.pnpm/thread-stream@*/node_modules/thread-stream/LICENSE',
  'node_modules/.pnpm/thread-stream@*/node_modules/thread-stream/bench.js',
] as const;

const turbopackRules = Object.fromEntries(
  turbopackIgnorePatterns.map((pattern) => [
    pattern,
    {
      loaders: [emptyTurbopackLoader],
      as: '*.js',
    },
  ])
) satisfies NonNullable<NextConfig['turbopack']>['rules'];

export const createSecurityHeaders = (isDev: boolean, isProd: boolean) => {
  const cspDirectives = [
    "default-src 'self'",
    // Allow inline scripts/styles for compatibility; avoid unsafe-eval in production when possible.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https:`,
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https:",
    "font-src 'self' data: https:",
    "frame-ancestors 'none'",
    "form-action 'self'",
    'base-uri self',
    'upgrade-insecure-requests',
  ];

  const headers: { key: string; value: string }[] = [
    {
      key: 'Content-Security-Policy',
      value: cspDirectives.join('; '),
    },
    {
      key: 'X-Content-Type-Options',
      value: 'nosniff',
    },
    {
      key: 'Referrer-Policy',
      value: 'strict-origin-when-cross-origin',
    },
    {
      key: 'Permissions-Policy',
      // Disable high‑risk browser features by default; extend per project needs.
      value:
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()',
    },
    {
      key: 'X-Frame-Options',
      value: 'DENY',
    },
  ];

  if (isProd) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    });
  }

  return headers;
};

/**
 * https://nextjs.org/docs/app/api-reference/config/next-config-js
 */
const nextConfig: NextConfig = {
  // Docker standalone output
  ...(process.env.DOCKER_BUILD === 'true' && { output: 'standalone' }),

  /* config options here */
  devIndicators: false,

  // https://nextjs.org/docs/architecture/nextjs-compiler#remove-console
  // Remove all console.* calls in production only
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },

  images: imageOptimizationConfig,

  env: {
    NEXT_TELEMETRY_DISABLED: serverEnv.telemetry.disabled ? '1' : '0',
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';
    const isProd = !isDev;
    const securityHeaders = createSecurityHeaders(isDev, isProd);

    const sensitiveNoStoreHeaders = [
      {
        key: 'Cache-Control',
        value: 'private, no-store, no-cache, max-age=0, must-revalidate',
      },
    ];

    return [
      // Global baseline security headers for all routes.
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      // Auth pages (login / register / reset-password / etc.).
      {
        source: '/:locale/auth/:path*',
        headers: sensitiveNoStoreHeaders,
      },
      // Protected application areas (dashboard / settings / admin).
      {
        source: '/:locale/dashboard/:path*',
        headers: sensitiveNoStoreHeaders,
      },
      {
        source: '/:locale/settings/:path*',
        headers: sensitiveNoStoreHeaders,
      },
      {
        source: '/:locale/admin/:path*',
        headers: sensitiveNoStoreHeaders,
      },
      // API routes, including auth and payment/billing endpoints.
      {
        source: '/api/:path*',
        headers: sensitiveNoStoreHeaders,
      },
    ];
  },
  turbopack: {
    rules: turbopackRules,
    resolveAlias: {
      'thread-stream': './src/lib/server/thread-stream-stub.js',
    },
  },
};

/**
 * You can specify the path to the request config file or use the default one (@/i18n/request.ts)
 *
 * https://next-intl.dev/docs/getting-started/app-router/with-i18n-routing#next-config
 */
const withNextIntl = createNextIntlPlugin();

/**
 * https://fumadocs.dev/docs/ui/manual-installation
 * https://fumadocs.dev/docs/mdx/plugin
 */
const withMDX = createMDX();

export default withMDX(withNextIntl(nextConfig));
