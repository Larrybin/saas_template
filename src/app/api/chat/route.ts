import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { ensureApiUser } from "@/lib/server/api-auth";
import { enforceRateLimit } from "@/lib/server/rate-limit";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
	const authResult = await ensureApiUser(req);
	if (!authResult.ok) {
		return authResult.response;
	}

	const rateLimitResult = await enforceRateLimit({
		request: req,
		scope: "chat",
		limit: 30,
		window: "1 m",
		userId: authResult.user.id,
	});

	if (!rateLimitResult.ok) {
		return rateLimitResult.response;
	}

	const {
		messages,
		model,
		webSearch,
	}: { messages: UIMessage[]; model: string; webSearch: boolean } =
		await req.json();

	const result = streamText({
		model: webSearch ? "perplexity/sonar" : model,
		messages: convertToModelMessages(messages),
		system:
			"You are a helpful assistant that can answer questions and help with tasks",
	});

	// send sources and reasoning back to the client
	return result.toUIMessageStreamResponse({
		sendSources: true,
		sendReasoning: true,
	});
}
