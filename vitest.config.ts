import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['vitest.setup.ts'],
    include: ['tests/**/*.test.ts', 'src/**/*.{test,spec}.{ts,tsx}'],
    reporters:
      process.env.CI === 'true'
        ? [
            'default',
            [
              'junit',
              {
                outputFile: 'test-results/junit-results.xml',
              },
            ],
          ]
        : 'default',
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
    },
    env: {
      NEXT_PUBLIC_BASE_URL: 'http://localhost:3000',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      BETTER_AUTH_SECRET: 'test-secret',
      NEXT_PUBLIC_MAIL_FROM_EMAIL: 'Larry Bin <support@labubuwholesale.com>',
      NEXT_PUBLIC_MAIL_SUPPORT_EMAIL: 'Larry Bin <support@labubuwholesale.com>',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@/content': path.resolve(__dirname, 'content'),
      '@/public': path.resolve(__dirname, 'public'),
    },
  },
});
