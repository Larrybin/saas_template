"use client";

import Script from "next/script";
import { websiteConfig } from "@/config/website";
import { clientEnv } from "@/env/client";

/**
 * Affonso Affiliate
 *
 * https://affonso.com
 */
export default function AffonsoScript() {
	if (process.env.NODE_ENV !== "production") {
		return null;
	}

	if (!websiteConfig.features.enableAffonsoAffiliate) {
		return null;
	}

	const affiliateId = clientEnv.affiliates.affonsoId;
	if (!affiliateId) {
		return null;
	}

	return (
		<Script
			src="https://affonso.io/js/pixel.min.js"
			strategy="afterInteractive"
			data-affonso={affiliateId}
			data-cookie_duration="30"
		/>
	);
}
