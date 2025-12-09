import { describe, expect, it, vi } from 'vitest';
import { GET as accessReconciliationGet } from '@/app/api/dev/access-reconciliation/route';
import { ErrorCodes } from '@/lib/server/error-codes';

vi.mock('@/lib/server/user-access-capabilities', () => ({
  getUserAccessCapabilities: vi.fn().mockResolvedValue(['plan:pro']),
}));

vi.mock('@/lib/server/creem-external-access-provider', () => ({
  getCreemFeatureEntitlementsForUser: vi
    .fn()
    .mockResolvedValue(['feature:creem:any-subscription']),
}));

describe('/api/dev/access-reconciliation route', () => {
  it('returns 400 envelope when userId is missing', async () => {
    const req = new Request('http://localhost/api/dev/access-reconciliation', {
      method: 'GET',
    });

    const res = await accessReconciliationGet(req);
    const json = (await res.json()) as {
      success: boolean;
      error?: string;
      code?: string;
      retryable?: boolean;
    };

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(ErrorCodes.UnexpectedError);
    expect(json.retryable).toBe(false);
  });

  it('returns success envelope with capabilities when userId is provided', async () => {
    const req = new Request(
      'http://localhost/api/dev/access-reconciliation?userId=user_123',
      {
        method: 'GET',
      }
    );

    const res = await accessReconciliationGet(req);
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        userId: string;
        localCapabilities: string[];
        creemFeatures: string[];
      };
    };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data?.userId).toBe('user_123');
    expect(json.data?.localCapabilities).toEqual(['plan:pro']);
    expect(json.data?.creemFeatures).toEqual([
      'feature:creem:any-subscription',
    ]);
  });
});
