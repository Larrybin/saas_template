import { expect, test } from '@playwright/test';
import {
  DEFAULT_LOGIN_REDIRECT,
  protectedRoutes,
  routesNotAllowedByLoggedInUsers,
} from '@/routes';

const shouldRunE2E = process.env.PLAYWRIGHT_ENABLE === 'true';
const run = shouldRunE2E ? test : test.skip;
const runDescribe = shouldRunE2E ? test.describe : test.describe.skip;

runDescribe('authentication routing safeguards', () => {
  run(
    'anonymous visitor is redirected from protected dashboard',
    async ({ page }) => {
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      await page.waitForURL('**/auth/login**');
      expect(page.url()).toContain('/auth/login');
    }
  );

  run(
    'existing session is redirected away from login',
    async ({ page }, testInfo) => {
      const base = testInfo.project.use.baseURL ?? 'http://127.0.0.1:3000';
      const hostname = new URL(base).hostname;
      const secure = base.startsWith('https://');

      await page.context().addCookies([
        {
          name: '__Secure-better-auth.session_token',
          value: 'test-session',
          domain: hostname,
          path: '/',
          httpOnly: true,
          secure,
          sameSite: 'Lax',
        },
      ]);

      await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });
      await page.waitForURL(`**${DEFAULT_LOGIN_REDIRECT}**`);
      expect(page.url()).toContain(DEFAULT_LOGIN_REDIRECT);
    }
  );

  run(
    'docs route respects persisted locale preference',
    async ({ page }, testInfo) => {
      const base = testInfo.project.use.baseURL ?? 'http://127.0.0.1:3000';
      const hostname = new URL(base).hostname;

      await page.context().addCookies([
        {
          name: 'NEXT_LOCALE',
          value: 'zh',
          domain: hostname,
          path: '/',
          sameSite: 'Lax',
        },
      ]);

      await page.goto('/docs', { waitUntil: 'domcontentloaded' });
      await page.waitForURL('**/zh/docs**');
      expect(page.url()).toContain('/zh/docs');
    }
  );
});

for (const route of protectedRoutes) {
  run(
    `anonymous user is bounced from protected route ${route}`,
    async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForURL('**/auth/login**');
      expect(page.url()).toContain('/auth/login');
    }
  );
}

for (const route of routesNotAllowedByLoggedInUsers) {
  run(
    `session holder is redirected away from ${route}`,
    async ({ page }, testInfo) => {
      const base = testInfo.project.use.baseURL ?? 'http://127.0.0.1:3000';
      const hostname = new URL(base).hostname;
      const secure = base.startsWith('https://');

      await page.context().addCookies([
        {
          name: '__Secure-better-auth.session_token',
          value: 'test-session',
          domain: hostname,
          path: '/',
          httpOnly: true,
          secure,
          sameSite: 'Lax',
        },
      ]);

      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(`**${DEFAULT_LOGIN_REDIRECT}**`);
      expect(page.url()).toContain(DEFAULT_LOGIN_REDIRECT);
    }
  );
}
