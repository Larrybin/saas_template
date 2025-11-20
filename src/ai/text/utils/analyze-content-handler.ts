import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import Firecrawl from '@mendable/firecrawl-js';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject } from 'ai';
import { z } from 'zod';

import {
  classifyError,
  ErrorSeverity,
  ErrorType,
  logError,
  WebContentAnalyzerError,
  withRetry,
} from '@/ai/text/utils/error-handling';
import {
  type AnalysisResults,
  type AnalyzeContentResponse,
  analyzeContentRequestSchema,
  type ModelProvider,
  validateUrl,
} from '@/ai/text/utils/web-content-analyzer';
import { webContentAnalyzerConfig } from '@/ai/text/utils/web-content-config.client';
import {
  getFirecrawlApiKey,
  validateFirecrawlConfig,
  webContentAnalyzerServerConfig,
} from '@/ai/text/utils/web-content-config.server';
import { serverEnv } from '@/env/server';

const TIMEOUT_MILLIS = webContentAnalyzerConfig.timeoutMillis;
const MAX_CONTENT_LENGTH = webContentAnalyzerConfig.maxContentLength;

const getFirecrawlClient = () => {
  const apiKey = getFirecrawlApiKey();
  return new Firecrawl({
    apiKey,
    apiUrl: webContentAnalyzerServerConfig.firecrawl.baseUrl,
  });
};

const openAIClient = serverEnv.ai.openaiApiKey
  ? createOpenAI({ apiKey: serverEnv.ai.openaiApiKey })
  : null;

const geminiClient = serverEnv.ai.googleGenerativeAiApiKey
  ? createGoogleGenerativeAI({
      apiKey: serverEnv.ai.googleGenerativeAiApiKey,
    })
  : null;

const deepseekClient = serverEnv.ai.deepseekApiKey
  ? createDeepSeek({
      apiKey: serverEnv.ai.deepseekApiKey,
    })
  : null;

const openRouterClient = serverEnv.ai.openrouterApiKey
  ? createOpenRouter({
      apiKey: serverEnv.ai.openrouterApiKey,
    })
  : null;

const analysisSchema = z.object({
  title: z.string().describe('Main title or product name from the webpage'),
  description: z.string().describe('Brief description in 1-2 sentences'),
  introduction: z
    .string()
    .describe('Detailed introduction paragraph about the content'),
  features: z.array(z.string()).describe('List of key features or highlights'),
  pricing: z
    .string()
    .describe('Pricing information or "Not specified" if unavailable'),
  useCases: z.array(z.string()).describe('List of use cases or applications'),
});

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

const truncateContent = (content: string, maxLength: number): string => {
  if (content.length <= maxLength) {
    return content;
  }

  const { contentTruncation } = webContentAnalyzerConfig;
  const preferredLength = Math.floor(
    maxLength * contentTruncation.preferredTruncationPoint
  );

  if (content.length < contentTruncation.minContentLength) {
    return `${content.substring(0, maxLength)}...`;
  }

  const truncated = content.substring(0, preferredLength);

  const sentences = content.split(/[.!?]+/);
  if (sentences.length > 1) {
    let sentenceLength = 0;
    let sentenceCount = 0;

    for (const sentence of sentences) {
      const nextLength = sentenceLength + sentence.length + 1;

      if (
        nextLength > maxLength ||
        sentenceCount >= contentTruncation.maxSentences
      ) {
        break;
      }

      sentenceLength = nextLength;
      sentenceCount++;
    }

    if (sentenceLength > preferredLength) {
      return `${sentences.slice(0, sentenceCount).join('.')}.`;
    }
  }

  const paragraphs = content.split(/\n\s*\n/);
  if (paragraphs.length > 1) {
    let paragraphLength = 0;

    for (const [index, paragraph] of paragraphs.entries()) {
      const nextLength = paragraphLength + paragraph.length + 2;

      if (nextLength > maxLength) {
        break;
      }

      paragraphLength = nextLength;

      if (paragraphLength > preferredLength) {
        return paragraphs.slice(0, index + 1).join('\n\n');
      }
    }
  }

  const words = truncated.split(' ');
  const lastCompleteWord = words.slice(0, -1).join(' ');

  if (lastCompleteWord.length > preferredLength) {
    return `${lastCompleteWord}...`;
  }

  return `${content.substring(0, maxLength)}...`;
};

async function scrapeWebpage(
  url: string
): Promise<{ content: string; screenshot?: string }> {
  return withRetry(async () => {
    const firecrawl = getFirecrawlClient();
    const firecrawlOptions = webContentAnalyzerServerConfig.firecrawl;

    try {
      const scrapeResponse = await firecrawl.scrape(url, {
        formats: Array.from(firecrawlOptions.formats),
        includeTags: Array.from(firecrawlOptions.includeTags),
        excludeTags: Array.from(firecrawlOptions.excludeTags),
        onlyMainContent: firecrawlOptions.onlyMainContent,
        waitFor: firecrawlOptions.waitFor,
      });

      const content = scrapeResponse.markdown ?? '';
      const screenshot = scrapeResponse.screenshot;

      if (!content.trim()) {
        throw new WebContentAnalyzerError(
          ErrorType.SCRAPING,
          'No content found on the webpage',
          'The webpage appears to be empty or inaccessible. Please try a different URL.',
          ErrorSeverity.MEDIUM,
          false
        );
      }

      return {
        content: truncateContent(content, MAX_CONTENT_LENGTH),
        ...(screenshot ? { screenshot } : {}),
      };
    } catch (error) {
      if (error instanceof WebContentAnalyzerError) {
        throw error;
      }

      throw classifyError(error);
    }
  });
}

async function analyzeContent(
  content: string,
  url: string,
  provider: ModelProvider
): Promise<AnalysisResults> {
  return withRetry(async () => {
    try {
      let model:
        | ReturnType<ReturnType<typeof createOpenAI>['chat']>
        | ReturnType<ReturnType<typeof createGoogleGenerativeAI>['chat']>
        | ReturnType<ReturnType<typeof createDeepSeek>['chat']>
        | ReturnType<ReturnType<typeof createOpenRouter>['chat']>;
      let temperature: number | undefined;
      let maxTokens: number | undefined;
      switch (provider) {
        case 'openai':
          if (!openAIClient) {
            throw new WebContentAnalyzerError(
              ErrorType.SERVICE_UNAVAILABLE,
              'OpenAI API key is not configured',
              'OpenAI provider is temporarily unavailable.',
              ErrorSeverity.CRITICAL,
              false
            );
          }
          model = openAIClient.chat(webContentAnalyzerConfig.openai.model);
          temperature = webContentAnalyzerConfig.openai.temperature;
          maxTokens = webContentAnalyzerConfig.openai.maxTokens;
          break;
        case 'gemini':
          if (!geminiClient) {
            throw new WebContentAnalyzerError(
              ErrorType.SERVICE_UNAVAILABLE,
              'Google Generative AI key is not configured',
              'Gemini provider is temporarily unavailable.',
              ErrorSeverity.CRITICAL,
              false
            );
          }
          model = geminiClient.chat(webContentAnalyzerConfig.gemini.model);
          temperature = webContentAnalyzerConfig.gemini.temperature;
          maxTokens = webContentAnalyzerConfig.gemini.maxTokens;
          break;
        case 'deepseek':
          if (!deepseekClient) {
            throw new WebContentAnalyzerError(
              ErrorType.SERVICE_UNAVAILABLE,
              'DeepSeek API key is not configured',
              'DeepSeek provider is temporarily unavailable.',
              ErrorSeverity.CRITICAL,
              false
            );
          }
          model = deepseekClient.chat(webContentAnalyzerConfig.deepseek.model);
          temperature = webContentAnalyzerConfig.deepseek.temperature;
          maxTokens = webContentAnalyzerConfig.deepseek.maxTokens;
          break;
        case 'openrouter':
          if (!openRouterClient) {
            throw new WebContentAnalyzerError(
              ErrorType.SERVICE_UNAVAILABLE,
              'OpenRouter API key is not configured',
              'OpenRouter provider is temporarily unavailable.',
              ErrorSeverity.CRITICAL,
              false
            );
          }
          model = openRouterClient.chat(
            webContentAnalyzerConfig.openrouter.model
          );
          temperature = webContentAnalyzerConfig.openrouter.temperature;
          maxTokens = webContentAnalyzerConfig.openrouter.maxTokens;
          break;
        default:
          throw new WebContentAnalyzerError(
            ErrorType.VALIDATION,
            'Invalid model provider',
            'Please select a valid model provider.',
            ErrorSeverity.MEDIUM,
            false
          );
      }
      const { object } = await generateObject({
        model,
        schema: analysisSchema,
        prompt: `
          Analyze the following webpage content and extract structured information.

          URL: ${url}
          Content: ${content}

          Please provide accurate and relevant information based on the content. If certain information is not available, use appropriate defaults:
          - For pricing: use "Not specified" if no pricing information is found
          - For features and use cases: provide empty arrays if none are found
          - Ensure the title and description are meaningful and based on the actual content
        `,
        temperature,
        maxOutputTokens: maxTokens,
      });

      return {
        ...object,
        url,
        analyzedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof WebContentAnalyzerError) {
        throw error;
      }
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes('rate limit') || message.includes('quota')) {
          throw new WebContentAnalyzerError(
            ErrorType.RATE_LIMIT,
            error.message,
            'AI service is temporarily overloaded. Please wait a moment and try again.',
            ErrorSeverity.MEDIUM,
            true,
            error
          );
        }
        if (message.includes('timeout') || message.includes('aborted')) {
          throw new WebContentAnalyzerError(
            ErrorType.TIMEOUT,
            error.message,
            'AI analysis timed out. Please try again with a shorter webpage.',
            ErrorSeverity.MEDIUM,
            true,
            error
          );
        }
      }
      throw classifyError(error);
    }
  });
}

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

export interface AnalyzeContentHandlerDeps {
  scrapeWebpage: typeof scrapeWebpage;
  analyzeContent: typeof analyzeContent;
}

const defaultDeps: AnalyzeContentHandlerDeps = {
  scrapeWebpage,
  analyzeContent,
};

export async function handleAnalyzeContentRequest(
  input: AnalyzeContentHandlerInput,
  deps: AnalyzeContentHandlerDeps = defaultDeps
): Promise<AnalyzeContentHandlerResult> {
  const { body, requestId, requestUrl, startTime } = input;

  try {
    const validationResult = analyzeContentRequestSchema.safeParse(body);

    if (!validationResult.success) {
      const validationError = new WebContentAnalyzerError(
        ErrorType.VALIDATION,
        'Invalid request parameters',
        'Please provide a valid URL.',
        ErrorSeverity.MEDIUM,
        false
      );

      logError(validationError, {
        requestId,
        validationErrors: validationResult.error,
      });

      return {
        status: 400,
        response: {
          success: false,
          error: validationError.userMessage,
        },
      };
    }

    const { url, modelProvider } = validationResult.data;
    // eslint-disable-next-line no-console
    console.log('modelProvider', modelProvider, 'url', url);

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

      logError(urlError, { requestId, url });

      return {
        status: 400,
        response: {
          success: false,
          error: urlError.userMessage,
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

      logError(configError, { requestId });

      return {
        status: 503,
        response: {
          success: false,
          error: configError.userMessage,
        },
      };
    }

    // eslint-disable-next-line no-console
    console.log(`Starting analysis [requestId=${requestId}, url=${url}]`);

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
    // eslint-disable-next-line no-console
    console.log(
      `Analysis completed [requestId=${requestId}, elapsed=${elapsed}s]`
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

    logError(analyzedError, {
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
      },
    };
  }
}
