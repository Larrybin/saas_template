import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '@/lib/logger';
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
    const calls: string[] = [];
    const hooks: UserLifecycleHooks = {
      'user.created': [
        async () => {
          calls.push('first');
        },
        () => {
          calls.push('second');
        },
      ],
    };

    const manager = new UserLifecycleManager({ hooks });
    await manager.emit(baseEvent as never);

    expect(calls).toEqual(['first', 'second']);
  });

  it('logs errors from failing hooks without throwing', async () => {
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    } as unknown as Logger;

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
