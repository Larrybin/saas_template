import { getLogger } from '@/lib/logger';
import type { Logger } from '@/lib/logger';
import type { UserLifecycleEvent, UserLifecycleHooks } from './types';

const defaultLogger = getLogger({ span: 'user-lifecycle' });

export type UserLifecycleManagerOptions = {
  hooks?: UserLifecycleHooks;
  logger?: Logger;
};

export class UserLifecycleManager {
  private readonly hooks: UserLifecycleHooks;
  private readonly logger: Logger;

  constructor(options: UserLifecycleManagerOptions = {}) {
    this.hooks = options.hooks ?? {};
    this.logger = options.logger ?? defaultLogger;
  }

  async emit(event: UserLifecycleEvent): Promise<void> {
    const handlers = this.hooks[event.type] ?? [];

    if (handlers.length === 0) {
      return;
    }

    const results = await Promise.allSettled(
      handlers.map(async (handler) => handler(event as never))
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error('[user-lifecycle] hook failed', {
          eventType: event.type,
          handlerIndex: index,
          error: result.reason,
        });
      }
    });
  }
}

export function createUserLifecycleManager(
  options?: UserLifecycleManagerOptions
) {
  return new UserLifecycleManager(options);
}
