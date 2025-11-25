import { generateObject } from 'ai';
import { z } from 'zod';

import {
  classifyError,
  ErrorSeverity,
  ErrorType,
  WebContentAnalyzerError,
  withRetry,
} from '@/ai/text/utils/error-handling';
import type {
  AnalysisResults,
  ModelProvider,
} from '@/ai/text/utils/web-content-analyzer';
import {
  type ProviderConfiguration,
  resolveProviderConfig,
} from './provider-factory';

type BaseAnalysis = Omit<AnalysisResults, 'url' | 'analyzedAt'>;

type PromptSchemaArgs = Parameters<typeof generateObject>[0] & {
  prompt: string;
  schema: typeof analysisSchema;
  temperature?: number;
  maxOutputTokens?: number;
};

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

export interface ContentAnalyzerDeps {
  resolveProviderConfig: typeof resolveProviderConfig;
}

const defaultDeps: ContentAnalyzerDeps = {
  resolveProviderConfig,
};

export async function analyzeContent(
  content: string,
  url: string,
  provider: ModelProvider,
  deps: ContentAnalyzerDeps = defaultDeps
): Promise<AnalysisResults> {
  return withRetry(async () => {
    try {
      const providerConfig = deps.resolveProviderConfig(provider);
      const analysis = await generateStructuredAnalysis(
        content,
        url,
        providerConfig
      );
      return {
        ...analysis,
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

async function generateStructuredAnalysis(
  content: string,
  url: string,
  providerConfig: ProviderConfiguration
): Promise<BaseAnalysis> {
  const request: PromptSchemaArgs = {
    model: providerConfig.model,
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
  };

  if (providerConfig.temperature !== undefined) {
    request.temperature = providerConfig.temperature;
  }

  if (providerConfig.maxTokens !== undefined) {
    request.maxOutputTokens = providerConfig.maxTokens;
  }

  const { object } = await generateObject(request);
  return analysisSchema.parse(object) as BaseAnalysis;
}
