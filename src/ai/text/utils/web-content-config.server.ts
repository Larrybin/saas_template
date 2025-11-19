import "server-only";

import { serverEnv } from "@/env/server";

export const webContentAnalyzerServerConfig = {
	firecrawl: {
		baseUrl: "https://api.firecrawl.dev",
		formats: ["markdown", "screenshot"] as const,
		includeTags: ["title", "meta", "h1", "h2", "h3", "p", "article"] as const,
		excludeTags: ["script", "style", "nav", "footer", "aside"] as const,
		onlyMainContent: true,
		waitFor: 2000,
		screenshot: {
			quality: 80,
			fullPage: false,
		},
		rateLimit: {
			maxConcurrentRequests: 3,
			requestDelay: 1000,
		},
		maxContentSize: 100000,
	},
} as const;

export function getFirecrawlApiKey() {
	return serverEnv.ai.firecrawlApiKey;
}

export function getFirecrawlConfig() {
	return {
		apiKey: getFirecrawlApiKey(),
		...webContentAnalyzerServerConfig.firecrawl,
	};
}

/**
 * Validates if the Firecrawl API key is configured
 * This must never run in the browser runtime.
 */
export function validateFirecrawlConfig(): boolean {
	if (!getFirecrawlApiKey()) {
		console.warn(
			"FIRECRAWL_API_KEY is not configured. Web content analysis features will not work.",
		);
		return false;
	}
	return true;
}
