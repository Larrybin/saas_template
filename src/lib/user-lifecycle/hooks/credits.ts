import { websiteConfig } from "@/config/website";
import {
	addMonthlyFreeCredits,
	addRegisterGiftCredits,
} from "@/credits/credits";
import { getAllPricePlans } from "@/lib/price-plan";
import type { UserLifecycleHook } from "../types";

export function createRegisterGiftCreditsHook(): UserLifecycleHook<"user.created"> {
	return async ({ user }) => {
		if (
			!websiteConfig.credits.enableCredits ||
			!websiteConfig.credits.registerGiftCredits.enable ||
			websiteConfig.credits.registerGiftCredits.amount <= 0
		) {
			return;
		}

		try {
			await addRegisterGiftCredits(user.id);
			console.log(`added register gift credits for user ${user.id}`);
		} catch (error) {
			console.error("Register gift credits error:", error);
		}
	};
}

export function createMonthlyFreeCreditsHook(): UserLifecycleHook<"user.created"> {
	return async ({ user }) => {
		if (!websiteConfig.credits.enableCredits) {
			return;
		}

		const pricePlans = getAllPricePlans();
		const freePlan = pricePlans.find(
			(plan) => plan.isFree && !plan.disabled && plan.credits?.enable,
		);

		if (!freePlan) {
			return;
		}

		try {
			await addMonthlyFreeCredits(user.id, freePlan.id);
			console.log(`added Free monthly credits for user ${user.id}`);
		} catch (error) {
			console.error("Free monthly credits error:", error);
		}
	};
}
