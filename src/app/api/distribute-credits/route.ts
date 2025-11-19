import { NextResponse } from "next/server";
import { distributeCreditsToAllUsers } from "@/credits/distribute";
import { serverEnv } from "@/env/server";
import { createLoggerFromHeaders, type Logger } from "@/lib/server/logger";

// Basic authentication middleware
function validateBasicAuth(request: Request, logger: Logger): boolean {
	const authHeader = request.headers.get("authorization");

	if (!authHeader || !authHeader.startsWith("Basic ")) {
		return false;
	}

	// Extract credentials from Authorization header
	const base64Credentials = authHeader.split(" ")[1];
	const credentials = Buffer.from(base64Credentials, "base64").toString(
		"utf-8",
	);
	const [username, password] = credentials.split(":");

	// Validate against environment variables
	const expectedUsername = serverEnv.cronJobs.username;
	const expectedPassword = serverEnv.cronJobs.password;

	if (!expectedUsername || !expectedPassword) {
		logger.error(
			"Basic auth credentials not configured in environment variables",
		);
		return false;
	}

	return username === expectedUsername && password === expectedPassword;
}

/**
 * distribute credits to all users daily
 */
export async function GET(request: Request) {
	const log = createLoggerFromHeaders(request.headers, {
		route: "/api/distribute-credits",
		span: "distributeCredits",
	});
	// Validate basic authentication
	if (!validateBasicAuth(request, log)) {
		log.warn("Unauthorized attempt to distribute credits");
		return new NextResponse("Unauthorized", {
			status: 401,
			headers: {
				"WWW-Authenticate": 'Basic realm="Secure Area"',
			},
		});
	}

	log.info("Distribute credits job triggered");
	const { usersCount, processedCount, errorCount } =
		await distributeCreditsToAllUsers();
	log.info(
		{ usersCount, processedCount, errorCount },
		"Distribute credits completed",
	);
	return NextResponse.json({
		message: `distribute credits success, users: ${usersCount}, processed: ${processedCount}, errors: ${errorCount}`,
		usersCount,
		processedCount,
		errorCount,
	});
}
