import { analyzeContent, scrapeWebpage } from '@/ai/text/utils/analyze-content';
import {
  classifyError,
  ErrorSeverity,
  ErrorType,
  WebContentAnalyzerError,
} from '@/ai/text/utils/error-handling';
import { logAnalyzerErrorServer } from '@/ai/text/utils/error-logging.server';
import {
  type AnalyzeContentResponse,
  analyzeContentRequestSchema,
  type ModelProvider,
  validateUrl,
} from '@/ai/text/utils/web-content-analyzer';
import { webContentAnalyzerConfig } from '@/ai/text/utils/web-content-config.client';
import { validateFirecrawlConfig } from '@/ai/text/utils/web-content-config.server';
import { getLogger } from '@/lib/server/logger';

const TIMEOUT_MILLIS = webContentAnalyzerConfig.timeoutMillis;

const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMillis: number
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), timeoutMillis)
    ),
  ]);
};

export interface AnalyzeContentHandlerInput {
  body: unknown;
  requestId: string;
  requestUrl: string;
  startTime: number;
}

export interface AnalyzeContentHandlerResult {
  status: number;
  response: AnalyzeContentResponse;
}

export type AnalyzeContentPreflightSuccess = {
  ok: true;
  data: { url: string; modelProvider: ModelProvider };
};

export type AnalyzeContentPreflightFailure = {
  ok: false;
  result: AnalyzeContentHandlerResult;
};

export type AnalyzeContentPreflightResult =
  | AnalyzeContentPreflightSuccess
  | AnalyzeContentPreflightFailure;

export interface AnalyzeContentHandlerDeps {
  scrapeWebpage: typeof scrapeWebpage;
  analyzeContent: typeof analyzeContent;
}

const defaultDeps: AnalyzeContentHandlerDeps = {
  scrapeWebpage,
  analyzeContent,
};

export function preflightAnalyzeContentRequest({
  body,
  requestId,
}: {
  body: unknown;
  requestId: string;
}): AnalyzeContentPreflightResult {
  const validationResult = analyzeContentRequestSchema.safeParse(body);

  if (!validationResult.success) {
    const validationError = new WebContentAnalyzerError(
      ErrorType.VALIDATION,
      'Invalid request parameters',
      'Please provide a valid URL.',
      ErrorSeverity.MEDIUM,
      false
    );

    logAnalyzerErrorServer(validationError, {
      requestId,
      validationErrors: validationResult.error,
    });

    return {
      ok: false,
      result: {
        status: 400,
        response: {
          success: false,
          error: validationError.userMessage,
          code: validationError.code,
          retryable: validationError.retryable,
        },
      },
    };
  }

  const { url, modelProvider } = validationResult.data;

  const urlValidation = validateUrl(url);
  if (!urlValidation.success) {
    const firstIssue = urlValidation.error?.issues[0];
    const urlMessage = firstIssue?.message ?? 'Invalid URL';

    const urlError = new WebContentAnalyzerError(
      ErrorType.VALIDATION,
      urlMessage,
      'Please enter a valid URL starting with http:// or https://',
      ErrorSeverity.MEDIUM,
      false
    );

    logAnalyzerErrorServer(urlError, { requestId, url });

    return {
      ok: false,
      result: {
        status: 400,
        response: {
          success: false,
          error: urlError.userMessage,
          code: urlError.code,
          retryable: urlError.retryable,
        },
      },
    };
  }

  if (!validateFirecrawlConfig()) {
    const configError = new WebContentAnalyzerError(
      ErrorType.SERVICE_UNAVAILABLE,
      'Firecrawl API key is not configured',
      'Web content analysis service is temporarily unavailable.',
      ErrorSeverity.CRITICAL,
      false
    );

    logAnalyzerErrorServer(configError, { requestId });

    return {
      ok: false,
      result: {
        status: 503,
        response: {
          success: false,
          error: configError.userMessage,
          code: configError.code,
          retryable: configError.retryable,
        },
      },
    };
  }

  return {
    ok: true,
    data: { url, modelProvider },
  };
}

export async function handleAnalyzeContentRequest(
  input: AnalyzeContentHandlerInput,
  deps: AnalyzeContentHandlerDeps = defaultDeps
): Promise<AnalyzeContentHandlerResult> {
  const { body, requestId, requestUrl, startTime } = input;
  const logger = getLogger({
    span: 'ai.web-content-analyzer',
    requestId,
  });

  try {
    const preflight = preflightAnalyzeContentRequest({ body, requestId });
    if (!preflight.ok) {
      return preflight.result;
    }

    const { url, modelProvider } = preflight.data;
    logger.debug({ modelProvider, url }, 'Received analyze-content request');

    logger.info({ url }, 'Starting analyze-content request');

    const analysisPromise = (async () => {
      try {
        const { content, screenshot } = await deps.scrapeWebpage(url);
        const analysis = await deps.analyzeContent(content, url, modelProvider);

        return {
          analysis,
          ...(screenshot ? { screenshot } : {}),
        };
      } catch (error) {
        if (error instanceof WebContentAnalyzerError) {
          throw error;
        }

        throw classifyError(error);
      }
    })();

    const result = await withTimeout(analysisPromise, TIMEOUT_MILLIS);

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    logger.info(
      { elapsedSeconds: elapsed, url },
      'Completed analyze-content request'
    );

    return {
      status: 200,
      response: {
        success: true,
        data: result,
      },
    };
  } catch (error) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

    const analyzedError =
      error instanceof WebContentAnalyzerError ? error : classifyError(error);

    logAnalyzerErrorServer(analyzedError, {
      requestId,
      elapsed: `${elapsed}s`,
      url: requestUrl,
    });

    let statusCode = 500;
    switch (analyzedError.type) {
      case ErrorType.VALIDATION:
        statusCode = 400;
        break;
      case ErrorType.TIMEOUT:
        statusCode = 408;
        break;
      case ErrorType.SCRAPING:
        statusCode = 422;
        break;
      case ErrorType.RATE_LIMIT:
        statusCode = 429;
        break;
      case ErrorType.SERVICE_UNAVAILABLE:
        statusCode = 503;
        break;
      default:
        statusCode = 500;
    }

    return {
      status: statusCode,
      response: {
        success: false,
        error: analyzedError.userMessage,
        code: analyzedError.code,
        retryable: analyzedError.retryable,
      },
    };
  }
}
