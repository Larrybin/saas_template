import { clientEnv } from "@/env/client";

/**
 * check if the website is a demo website
 */
export function isDemoWebsite() {
	return clientEnv.isDemoWebsite;
}
