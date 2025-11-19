import { websiteConfig } from "@/config/website";
import { subscribe } from "@/newsletter";
import type { UserLifecycleHook } from "../types";

const NEWSLETTER_DELAY_MS = 2000;

export function createNewsletterAutoSubscribeHook(): UserLifecycleHook<"user.created"> {
	return ({ user }) => {
		if (
			!user.email ||
			!websiteConfig.newsletter.enable ||
			!websiteConfig.newsletter.autoSubscribeAfterSignUp
		) {
			return;
		}

		setTimeout(async () => {
			try {
				const subscribed = await subscribe(user.email!);
				if (!subscribed) {
					console.error(`Failed to subscribe user ${user.email} to newsletter`);
				}
			} catch (error) {
				console.error("Newsletter subscription error:", error);
			}
		}, NEWSLETTER_DELAY_MS);
	};
}
