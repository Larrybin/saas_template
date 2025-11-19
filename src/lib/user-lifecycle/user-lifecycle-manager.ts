import type { LifecycleLogger } from "./logger";
import { createConsoleLifecycleLogger } from "./logger";
import type { UserLifecycleEvent, UserLifecycleHooks } from "./types";

export type UserLifecycleManagerOptions = {
	hooks?: UserLifecycleHooks;
	logger?: LifecycleLogger;
};

export class UserLifecycleManager {
	private readonly hooks: UserLifecycleHooks;
	private readonly logger: LifecycleLogger;

	constructor(options: UserLifecycleManagerOptions = {}) {
		this.hooks = options.hooks ?? {};
		this.logger = options.logger ?? createConsoleLifecycleLogger();
	}

	async emit(event: UserLifecycleEvent): Promise<void> {
		const handlers = this.hooks[event.type] ?? [];

		if (handlers.length === 0) {
			return;
		}

		for (const [index, handler] of handlers.entries()) {
			try {
				await handler(event as never);
			} catch (error) {
				this.logger.error("[user-lifecycle] hook failed", {
					eventType: event.type,
					handlerIndex: index,
					error,
				});
			}
		}
	}
}

export function createUserLifecycleManager(
	options?: UserLifecycleManagerOptions,
) {
	return new UserLifecycleManager(options);
}
