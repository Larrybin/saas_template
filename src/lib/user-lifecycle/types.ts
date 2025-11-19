import type { Locale } from "next-intl";
import type { User } from "@/lib/auth-types";

export type UserLifecycleUserPayload = Pick<User, "id" | "email" | "name">;

export type UserLifecycleEventMap = {
	"user.created": {
		user: UserLifecycleUserPayload;
		locale?: Locale;
	};
};

export type UserLifecycleEvent = {
	[Type in keyof UserLifecycleEventMap]: {
		type: Type;
	} & UserLifecycleEventMap[Type];
}[keyof UserLifecycleEventMap];

export type ExtractUserLifecycleEvent<Type extends UserLifecycleEvent["type"]> =
	Extract<UserLifecycleEvent, { type: Type }>;

export type UserLifecycleHook<
	Type extends UserLifecycleEvent["type"] = UserLifecycleEvent["type"],
> = (event: ExtractUserLifecycleEvent<Type>) => Promise<void> | void;

export type UserLifecycleHooks = {
	[Type in UserLifecycleEvent["type"]]?: Array<UserLifecycleHook<Type>>;
};
