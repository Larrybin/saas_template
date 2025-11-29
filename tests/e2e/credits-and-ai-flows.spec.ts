import { expect, test } from '@playwright/test';
import { Routes } from '@/routes';

const shouldRunE2E = process.env.PLAYWRIGHT_ENABLE === 'true';
const run = shouldRunE2E ? test : test.skip;
const runDescribe = shouldRunE2E ? test.describe : test.describe.skip;

runDescribe('credits and AI flows', () => {
  run(
    'navbar shows credits settings link for authenticated user',
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

      await page.goto(Routes.Dashboard, { waitUntil: 'domcontentloaded' });

      const creditsLink = page
        .getByRole('link', { name: /credits/i })
        .or(page.getByRole('link', { name: /积分/i }));

      await expect(creditsLink).toBeVisible();
    }
  );

  run(
    'user can navigate to settings credits page',
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

      await page.goto(Routes.SettingsCredits, {
        waitUntil: 'domcontentloaded',
      });

      await expect(
        page
          .getByRole('heading', { level: 1 })
          .or(page.getByRole('heading', { level: 2 }))
      ).toContainText(/credits|积分/i);
    }
  );

  run('AI chat happy path renders a response', async ({ page }, testInfo) => {
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

    await page.goto(Routes.AIChat, { waitUntil: 'domcontentloaded' });

    const input = page
      .getByPlaceholder(/ask.*anything|message the ai|聊天/i)
      .or(page.getByRole('textbox'));

    await input.fill('Hello from E2E test');
    await input.press('Enter');

    const messageLocator = page
      .getByText(/Hello from E2E test/, { exact: false })
      .or(page.getByText(/response|回答|reply/i));

    await expect(messageLocator).toBeVisible();
  });

  run('AI analyze page basic render', async ({ page }, testInfo) => {
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

    await page.goto(Routes.AIText, { waitUntil: 'domcontentloaded' });

    const urlInput = page
      .getByPlaceholder(/https?:\/\/|url/i)
      .or(page.getByRole('textbox'));

    await urlInput.fill('https://example.com');

    const analyzeButton = page
      .getByRole('button', { name: /analyze|分析/i })
      .first();

    await analyzeButton.click();

    const resultSection = page
      .getByText(/analysis|结果|summary|摘要/i)
      .or(page.getByRole('region'));

    await expect(resultSection).toBeVisible();
  });
});
