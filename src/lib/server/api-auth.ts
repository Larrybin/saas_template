import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { User } from "@/lib/auth-types";

type ApiAuthResult =
	| {
			ok: true;
			user: User;
	  }
	| {
			ok: false;
			response: NextResponse;
	  };

const unauthorizedResponse = NextResponse.json(
	{ error: "Unauthorized" },
	{
		status: 401,
		headers: {
			"WWW-Authenticate": "Bearer",
		},
	},
);

/**
 * Ensures the incoming API request has an authenticated Better Auth session.
 * Returns the resolved user when successful or a standardized 401 response on failure.
 */
export async function ensureApiUser(request: Request): Promise<ApiAuthResult> {
	try {
		const session = await auth.api.getSession({
			headers: request.headers,
		});

		if (session?.user) {
			return {
				ok: true,
				user: session.user,
			};
		}
	} catch (error) {
		console.error("Failed to authenticate API request:", error);
	}

	return {
		ok: false,
		response: unauthorizedResponse,
	};
}
