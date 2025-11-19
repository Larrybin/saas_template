export const featureFlags = {
	enableCreditPeriodKey:
		process.env.ENABLE_CREDIT_PERIOD_KEY === "true" ||
		process.env.ENABLE_CREDIT_PERIOD_KEY === "1",
};

export type FeatureFlags = typeof featureFlags;
