import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serverEnv } from '@/env/server';

const runCreditsDistributionJobMock = vi.fn();

vi.mock('@/lib/server/usecases/distribute-credits-job', () => ({
  runCreditsDistributionJob: (...args: unknown[]) =>
    runCreditsDistributionJobMock(...args),
}));

// Import route handler after mocks are in place
import { GET as distributeCreditsGet } from '@/app/api/distribute-credits/route';

const encodeBasicAuth = (username: string, password: string) => {
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${credentials}`;
};

describe('/api/distribute-credits route', () => {
  const username = 'cron-user';
  const password = 'cron-pass';

  beforeEach(() => {
    vi.clearAllMocks();
    serverEnv.cronJobs.username = undefined;
    serverEnv.cronJobs.password = undefined;
  });

  it('returns 401 when basic auth is missing', async () => {
    serverEnv.cronJobs.username = username;
    serverEnv.cronJobs.password = password;

    const req = new Request('http://localhost/api/distribute-credits', {
      method: 'GET',
    });

    const res = await distributeCreditsGet(req);
    const json = (await res.json()) as {
      success: boolean;
      error?: string;
      code?: string;
      retryable?: boolean;
    };

    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain('Basic');
    expect(json.success).toBe(false);
    expect(json.code).toBe('AUTH_UNAUTHORIZED');
    expect(json.retryable).toBe(false);
  });

  it('returns 401 when basic auth credentials are invalid', async () => {
    serverEnv.cronJobs.username = username;
    serverEnv.cronJobs.password = password;
    const req = new Request('http://localhost/api/distribute-credits', {
      method: 'GET',
      headers: {
        authorization: encodeBasicAuth('wrong', 'creds'),
      },
    });

    const res = await distributeCreditsGet(req);
    const json = (await res.json()) as {
      success: boolean;
      error?: string;
      code?: string;
      retryable?: boolean;
    };

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.code).toBe('AUTH_UNAUTHORIZED');
    expect(json.retryable).toBe(false);
    expect(runCreditsDistributionJobMock).not.toHaveBeenCalled();
  });

  it('returns 500 when env credentials are not configured', async () => {
    const req = new Request('http://localhost/api/distribute-credits', {
      method: 'GET',
      headers: {
        authorization: encodeBasicAuth(username, password),
      },
    });

    const res = await distributeCreditsGet(req);
    const json = (await res.json()) as {
      success: boolean;
      error?: string;
      code?: string;
      retryable?: boolean;
    };

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.code).toBe('CRON_BASIC_AUTH_MISCONFIGURED');
    expect(json.retryable).toBe(false);
    expect(runCreditsDistributionJobMock).not.toHaveBeenCalled();
  });

  it('returns 200 and forwards job result on success', async () => {
    serverEnv.cronJobs.username = username;
    serverEnv.cronJobs.password = password;
    runCreditsDistributionJobMock.mockResolvedValue({
      usersCount: 10,
      processedCount: 9,
      errorCount: 1,
    });

    const req = new Request('http://localhost/api/distribute-credits', {
      method: 'GET',
      headers: {
        authorization: encodeBasicAuth(username, password),
      },
    });

    const res = await distributeCreditsGet(req);
    const json = (await res.json()) as {
      success: boolean;
      data?: { usersCount: number; processedCount: number; errorCount: number };
    };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      usersCount: 10,
      processedCount: 9,
      errorCount: 1,
    });
    expect(runCreditsDistributionJobMock).toHaveBeenCalledTimes(1);
  });

  it('returns 500 and error envelope when job throws', async () => {
    serverEnv.cronJobs.username = username;
    serverEnv.cronJobs.password = password;
    runCreditsDistributionJobMock.mockRejectedValue(
      new Error('job failed in test')
    );

    const req = new Request('http://localhost/api/distribute-credits', {
      method: 'GET',
      headers: {
        authorization: encodeBasicAuth(username, password),
      },
    });

    const res = await distributeCreditsGet(req);
    const json = (await res.json()) as {
      success: boolean;
      error?: string;
      code?: string;
      retryable?: boolean;
    };

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.code).toBe('CREDITS_DISTRIBUTION_FAILED');
    expect(json.retryable).toBe(true);
    expect(runCreditsDistributionJobMock).toHaveBeenCalledTimes(1);
  });
});
