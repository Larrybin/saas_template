import {
  ErrorSeverity,
  ErrorType,
  WebContentAnalyzerError,
  classifyError,
  logError,
  withRetry,
} from '@/ai/text/utils/error-handling';
import {
  type AnalysisResults,
  type AnalyzeContentResponse,
  analyzeContentRequestSchema,
  validateUrl,
} from '@/ai/text/utils/web-content-analyzer';
import {
  validateFirecrawlConfig,
  webContentAnalyzerConfig,
} from '@/ai/text/utils/web-content-analyzer-config';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import FirecrawlApp from '@mendable/firecrawl-js';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject } from 'ai';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Constants from configuration
const TIMEOUT_MILLIS = webContentAnalyzerConfig.timeoutMillis;
const MAX_CONTENT_LENGTH = webContentAnalyzerConfig.maxContentLength;

// Initialize Firecrawl client
const getFirecrawlClient = () => {
  if (!validateFirecrawlConfig()) {
    throw new Error('Firecrawl API key is not configured');
  }
  return new FirecrawlApp({
    apiKey: webContentAnalyzerConfig.firecrawl.apiKey,
  });
};

// AI analysis schema for structured output
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

// Timeout wrapper
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

// Enhanced content truncation with intelligent boundary detection
const truncateContent = (content: string, maxLength: number): string => {
  if (content.length <= maxLength) {
    return content;
  }

  const { contentTruncation } = webContentAnalyzerConfig;
  const preferredLength = Math.floor(
    maxLength * contentTruncation.preferredTruncationPoint
  );

  // If content is shorter than minimum threshold, use simple truncation
  if (content.length < contentTruncation.minContentLength) {
    return content.substring(0, maxLength) + '...';
  }

  // Try to find the best truncation point
  const truncated = content.substring(0, preferredLength);

  // First, try to truncate at sentence boundaries
  const sentences = content.split(/[.!?]+/);
  if (sentences.length > 1) {
    let sentenceLength = 0;
    let sentenceCount = 0;

    for (const sentence of sentences) {
      const nextLength = sentenceLength + sentence.length + 1; // +1 for punctuation

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
      return sentences.slice(0, sentenceCount).join('.') + '.';
    }
  }

  // If sentence boundary doesn't work well, try paragraph boundaries
  const paragraphs = content.split(/\n\s*\n/);
  if (paragraphs.length > 1) {
    let paragraphLength = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const nextLength = paragraphLength + paragraphs[i].length + 2; // +2 for \n\n

      if (nextLength > maxLength) {
        break;
      }

      paragraphLength = nextLength;

      if (paragraphLength > preferredLength) {
        return paragraphs.slice(0, i + 1).join('\n\n');
      }
    }
  }

  // Fallback to word boundary truncation
  const words = truncated.split(' ');
  const lastCompleteWord = words.slice(0, -1).join(' ');

  if (lastCompleteWord.length > preferredLength) {
    return lastCompleteWord + '...';
  }

  // Final fallback to character truncation
  return content.substring(0, maxLength) + '...';
};

// Scrape webpage using Firecrawl with retry logic
async function scrapeWebpage(
  url: string
): Promise<{ content: string; screenshot?: string }> {
  return withRetry(async () => {
    const firecrawl = getFirecrawlClient();

    try {
      const scrapeResponse = await firecrawl.scrapeUrl(url, {
        formats: ['markdown', 'screenshot'],
        onlyMainContent: webContentAnalyzerConfig.firecrawl.onlyMainContent,
        waitFor: webContentAnalyzerConfig.firecrawl.waitFor,
      });

      if (!scrapeResponse.success) {
        throw new WebContentAnalyzerError(
          ErrorType.SCRAPING,
          scrapeResponse.error || 'Failed to scrape webpage',
          'Unable to access the webpage. Please check the URL and try again.',
          ErrorSeverity.MEDIUM,
          true
        );
      }

      const content = scrapeResponse.markdown || '';
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
        screenshot,
      };
    } catch (error) {
      if (error instanceof WebContentAnalyzerError) {
        throw error;
      }

      // Classify and throw the error
      throw classifyError(error);
    }
  });
}

// Analyze content using selected provider with retry logic
async function analyzeContent(
  content: string,
  url: string,
  provider: string
): Promise<AnalysisResults> {
  return withRetry(async () => {
    try {
      let model: any;
      let temperature: number | undefined;
      let maxTokens: number | undefined;
      switch (provider) {
        case 'openai':
          model = createOpenAI({
            apiKey: process.env.OPENAI_API_KEY,
          }).chat(webContentAnalyzerConfig.openai.model);
          temperature = webContentAnalyzerConfig.openai.temperature;
          maxTokens = webContentAnalyzerConfig.openai.maxTokens;
          break;
        case 'gemini':
          model = createGoogleGenerativeAI({
            apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
          }).chat(webContentAnalyzerConfig.gemini.model);
          temperature = webContentAnalyzerConfig.gemini.temperature;
          maxTokens = webContentAnalyzerConfig.gemini.maxTokens;
          break;
        case 'deepseek':
          model = createDeepSeek({
            apiKey: process.env.DEEPSEEK_API_KEY,
          }).chat(webContentAnalyzerConfig.deepseek.model);
          temperature = webContentAnalyzerConfig.deepseek.temperature;
          maxTokens = webContentAnalyzerConfig.deepseek.maxTokens;
          break;
        case 'openrouter':
          model = createOpenRouter({
            apiKey: process.env.OPENROUTER_API_KEY,
          }).chat(webContentAnalyzerConfig.openrouter.model);
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
      // Check for specific OpenAI/AI errors
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
      // Classify and throw the error
      throw classifyError(error);
    }
  });
}

export async function POST(req: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = performance.now();

  try {
    // Parse and validate request
    const body = await req.json();
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

      return NextResponse.json(
        {
          success: false,
          error: validationError.userMessage,
        } satisfies AnalyzeContentResponse,
        { status: 400 }
      );
    }

    const { url, modelProvider } = validationResult.data;
    console.log('modelProvider', modelProvider, 'url', url);

    // Additional URL validation
    const urlValidation = validateUrl(url);
    if (!urlValidation.success) {
      const urlError = new WebContentAnalyzerError(
        ErrorType.VALIDATION,
        urlValidation.error.issues[0]?.message || 'Invalid URL',
        'Please enter a valid URL starting with http:// or https://',
        ErrorSeverity.MEDIUM,
        false
      );

      logError(urlError, { requestId, url });

      return NextResponse.json(
        {
          success: false,
          error: urlError.userMessage,
        } satisfies AnalyzeContentResponse,
        { status: 400 }
      );
    }

    // Check if Firecrawl is configured
    if (!validateFirecrawlConfig()) {
      const configError = new WebContentAnalyzerError(
        ErrorType.SERVICE_UNAVAILABLE,
        'Firecrawl API key is not configured',
        'Web content analysis service is temporarily unavailable.',
        ErrorSeverity.CRITICAL,
        false
      );

      logError(configError, { requestId });

      return NextResponse.json(
        {
          success: false,
          error: configError.userMessage,
        } satisfies AnalyzeContentResponse,
        { status: 503 }
      );
    }

    console.log(`Starting analysis [requestId=${requestId}, url=${url}]`);

    // Perform analysis with timeout and enhanced error handling
    const analysisPromise = (async () => {
      try {
        // Step 1: Scrape webpage
        const { content, screenshot } = await scrapeWebpage(url);

        // Step 2: Analyze content with AI (pass provider)
        const analysis = await analyzeContent(content, url, modelProvider);

        return { analysis, screenshot };
      } catch (error) {
        // If it's already a WebContentAnalyzerError, just re-throw
        if (error instanceof WebContentAnalyzerError) {
          throw error;
        }

        // Otherwise classify the error
        throw classifyError(error);
      }
    })();

    // Apply timeout wrapper
    const result = await withTimeout(analysisPromise, TIMEOUT_MILLIS);

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(
      `Analysis completed [requestId=${requestId}, elapsed=${elapsed}s]`
    );

    return NextResponse.json({
      success: true,
      data: result,
    } satisfies AnalyzeContentResponse);
  } catch (error) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

    // Classify the error if it's not already a WebContentAnalyzerError
    const analyzedError =
      error instanceof WebContentAnalyzerError ? error : classifyError(error);

    // Log the error with context
    logError(analyzedError, {
      requestId,
      elapsed: `${elapsed}s`,
      url: req.url,
    });

    // Determine status code based on error type
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

    return NextResponse.json(
      {
        success: false,
        error: analyzedError.userMessage,
      } satisfies AnalyzeContentResponse,
      { status: statusCode }
    );
  }
}
