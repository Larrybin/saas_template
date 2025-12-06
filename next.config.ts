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
