"use client";

import { Crisp } from "crisp-sdk-web";
import { useEffect } from "react";
import { websiteConfig } from "@/config/website";
import { clientEnv } from "@/env/client";

/**
 * Crisp chat component
 * https://crisp.chat/en/
 * https://help.crisp.chat/en/article/how-do-i-install-crisp-live-chat-on-nextjs-xh9yse/
 */
const CrispChat = () => {
	useEffect(() => {
		if (!websiteConfig.features.enableCrispChat) {
			console.log("Crisp chat is disabled");
			return;
		}

		const websiteId = clientEnv.crispWebsiteId;
		if (!websiteId) {
			console.warn("Crisp website ID is not configured.");
			return;
		}

		try {
			Crisp.configure(websiteId);
			console.log("Crisp chat initialized successfully");
		} catch (error) {
			console.error("Failed to initialize Crisp chat:", error);
		}
	}, []);

	return null;
};

export default CrispChat;
