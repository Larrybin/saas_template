import type { UserLifecycleHooks } from "../types";
import {
	createMonthlyFreeCreditsHook,
	createRegisterGiftCreditsHook,
} from "./credits";
import { createNewsletterAutoSubscribeHook } from "./newsletter";

export function createDefaultUserLifecycleHooks(): UserLifecycleHooks {
	return {
		"user.created": [
			createNewsletterAutoSubscribeHook(),
			createRegisterGiftCreditsHook(),
			createMonthlyFreeCreditsHook(),
		],
	};
}
