import { describe, expect, it, vi } from 'vitest';
import type { LifecycleLogger } from '../logger';
import type { UserLifecycleHooks } from '../types';
import { UserLifecycleManager } from '../user-lifecycle-manager';

describe('UserLifecycleManager', () => {
  const baseEvent = {
    type: 'user.created' as const,
    user: {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test',
    },
  };

  it('executes hooks for emitted event', async () => {
    const calls: Array<{ label: string; order: number }> = [];
    const hooks: UserLifecycleHooks = {
      'user.created': [
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          calls.push({ label: 'first', order: Date.now() });
        },
        () => {
          calls.push({ label: 'second', order: Date.now() });
        },
      ],
    };

    const logger: LifecycleLogger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };

    const manager = new UserLifecycleManager({ hooks, logger });
    await manager.emit(baseEvent as never);

    expect(calls.map((item) => item.label)).toEqual(['first', 'second']);
    const [firstCall, secondCall] = calls;
    if (!firstCall || !secondCall) {
      throw new Error('Expected two hook calls to be recorded');
    }
    expect(firstCall.order).toBeLessThanOrEqual(secondCall.order);
  });

  it('logs errors from failing hooks without throwing', async () => {
    const logger: LifecycleLogger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };

    const hooks: UserLifecycleHooks = {
      'user.created': [
        async () => {
          throw new Error('boom');
        },
        async () => {
          // noop
        },
      ],
    };

    const manager = new UserLifecycleManager({ hooks, logger });
    await expect(manager.emit(baseEvent as never)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      '[user-lifecycle] hook failed',
      expect.objectContaining({ eventType: 'user.created' })
    );
  });
});
