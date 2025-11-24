import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client-logger', () => ({
  clientLogger: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

import { clientLogger } from '@/lib/client-logger';
import { PerformanceMonitor } from '../performance';

describe('PerformanceMonitor', () => {
  beforeEach(() => {
    vi.mocked(clientLogger.debug).mockReset();
    vi.mocked(clientLogger.warn).mockReset();
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('suppresses debug output when flag disabled outside development', () => {
    PerformanceMonitor.start('no-log');
    PerformanceMonitor.end('no-log');
    expect(clientLogger.debug).not.toHaveBeenCalled();
  });

  it('logs when performance flag enabled', () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_PERF_LOGS', 'true');
    PerformanceMonitor.start('log-on');
    PerformanceMonitor.end('log-on');
    expect(clientLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('log-on')
    );
  });
});
