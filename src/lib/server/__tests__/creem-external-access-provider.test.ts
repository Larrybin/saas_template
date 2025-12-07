import { checkSubscriptionAccess } from '@creem_io/better-auth/server';
import { describe, expect, it, vi } from 'vitest';

import { createCreemExternalAccessProvider } from '../creem-external-access-provider';

vi.mock('../creem-config', () => ({
  isCreemBetterAuthEnabled: true,
}));

vi.mock('@/env/server', () => ({
  serverEnv: {
    creemApiKey: 'test-api-key',
    creemWebhookSecret: 'test-webhook-secret',
  },
}));

describe('createCreemExternalAccessProvider', () => {
  it('returns false for non-feature capabilities and empty userId', async () => {
    const provider = createCreemExternalAccessProvider();

    await expect(
      provider.hasAccess('', 'feature:creem:any-subscription')
    ).resolves.toBe(false);
    await expect(provider.hasAccess('user_1', 'plan:pro')).resolves.toBe(false);
  });

  it('returns true when feature entitlement is present', async () => {
    vi.mocked(checkSubscriptionAccess).mockResolvedValueOnce({
      hasAccess: true,
    } as never);

    const provider = createCreemExternalAccessProvider();

    await expect(
      provider.hasAccess('user_1', 'feature:creem:any-subscription')
    ).resolves.toBe(true);
    await expect(provider.hasAccess('user_1', 'feature:unknown')).resolves.toBe(
      false
    );
  });

  it('returns false when underlying entitlements provider throws', async () => {
    vi.mocked(checkSubscriptionAccess).mockRejectedValueOnce(
      new Error('creem plugin error')
    );

    const provider = createCreemExternalAccessProvider();

    await expect(
      provider.hasAccess('user_1', 'feature:creem:any-subscription')
    ).resolves.toBe(false);
  });
});
