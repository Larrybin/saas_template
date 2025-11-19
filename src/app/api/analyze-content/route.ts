import { type NextRequest, NextResponse } from "next/server";

import {
	type AnalyzeContentHandlerInput,
	handleAnalyzeContentRequest,
} from "@/ai/text/utils/analyze-content-handler";
import {
	ErrorSeverity,
	ErrorType,
	logError,
	WebContentAnalyzerError,
} from "@/ai/text/utils/error-handling";
import type { AnalyzeContentResponse } from "@/ai/text/utils/web-content-analyzer";
import { ensureApiUser } from "@/lib/server/api-auth";
import { enforceRateLimit } from "@/lib/server/rate-limit";

export async function POST(req: NextRequest) {
	const authResult = await ensureApiUser(req);
	if (!authResult.ok) {
		return authResult.response;
	}

	const rateLimitResult = await enforceRateLimit({
		request: req,
		scope: "analyze-content",
		limit: 5,
		window: "5 m",
		userId: authResult.user.id,
	});

	if (!rateLimitResult.ok) {
		return rateLimitResult.response;
	}

	const requestId = Math.random().toString(36).substring(7);
	const startTime = performance.now();

	let body: unknown;
	try {
		body = await req.json();
	} catch (error) {
		const validationError = new WebContentAnalyzerError(
			ErrorType.VALIDATION,
			"Invalid JSON body",
			"Request body must be valid JSON.",
			ErrorSeverity.MEDIUM,
			false,
			error instanceof Error ? error : undefined,
		);

		logError(validationError, { requestId });

		return NextResponse.json(
			{
				success: false,
				error: validationError.userMessage,
			} satisfies AnalyzeContentResponse,
			{ status: 400 },
		);
	}

	const handlerInput: AnalyzeContentHandlerInput = {
		body,
		requestId,
		requestUrl: req.url,
		startTime,
	};

	const result = await handleAnalyzeContentRequest(handlerInput);

	return NextResponse.json(result.response, { status: result.status });
}
