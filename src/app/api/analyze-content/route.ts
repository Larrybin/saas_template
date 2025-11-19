import { type NextRequest, NextResponse } from 'next/server';

import {
  handleAnalyzeContentRequest,
  type AnalyzeContentHandlerInput,
} from '@/ai/text/utils/analyze-content-handler';
import { ensureApiUser } from '@/lib/server/api-auth';
import { enforceRateLimit } from '@/lib/server/rate-limit';

export async function POST(req: NextRequest) {
  const authResult = await ensureApiUser(req);
  if (!authResult.ok) {
    return authResult.response;
  }

  const rateLimitResult = await enforceRateLimit({
    request: req,
    scope: 'analyze-content',
    limit: 5,
    window: '5 m',
    userId: authResult.user.id,
  });

  if (!rateLimitResult.ok) {
    return rateLimitResult.response;
  }

  const requestId = Math.random().toString(36).substring(7);
  const startTime = performance.now();
  const body = await req.json();

  const handlerInput: AnalyzeContentHandlerInput = {
    body,
    requestId,
    requestUrl: req.url,
    startTime,
  };

  const result = await handleAnalyzeContentRequest(handlerInput);

  return NextResponse.json(result.response, { status: result.status });
}

