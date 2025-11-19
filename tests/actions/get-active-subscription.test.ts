import { describe, expect, test } from "vitest";
import { getActiveSubscriptionInputSchema } from "@/actions/schemas";

describe("getActiveSubscriptionAction schema", () => {
	test("accepts a valid payload", () => {
		const parsed = getActiveSubscriptionInputSchema.parse({
			userId: "user_123",
		});

		expect(parsed.userId).toBe("user_123");
	});

	test("rejects when userId is missing", () => {
		expect(() => getActiveSubscriptionInputSchema.parse({})).toThrowError(
			/Invalid input: expected string/,
		);
	});

	test("rejects when userId is empty", () => {
		expect(() =>
			getActiveSubscriptionInputSchema.parse({ userId: "" }),
		).toThrowError(/User ID is required/);
	});
});
