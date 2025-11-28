import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';

import {
  ErrorSeverity,
  ErrorType,
  WebContentAnalyzerError,
} from '@/ai/text/utils/error-handling';
import type { ModelProvider } from '@/ai/text/utils/web-content-analyzer';
import { webContentAnalyzerConfig } from '@/ai/text/utils/web-content-config.client';
import { serverEnv } from '@/env/server';

export type ProviderConfiguration = {
  model: LanguageModel;
  temperature?: number;
  maxTokens?: number;
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

export function resolveProviderConfig(
  provider: ModelProvider
): ProviderConfiguration {
  switch (provider) {
    case 'openai': {
      if (!openAIClient) {
        throw new WebContentAnalyzerError(
          ErrorType.SERVICE_UNAVAILABLE,
          'OpenAI API key is not configured',
          'OpenAI provider is temporarily unavailable.',
          ErrorSeverity.CRITICAL,
          false
        );
      }
      return {
        model: openAIClient.chat(
          webContentAnalyzerConfig.openai.model
        ) as LanguageModel,
        temperature: webContentAnalyzerConfig.openai.temperature,
        maxTokens: webContentAnalyzerConfig.openai.maxTokens,
      };
    }
    case 'gemini': {
      if (!geminiClient) {
        throw new WebContentAnalyzerError(
          ErrorType.SERVICE_UNAVAILABLE,
          'Google Generative AI key is not configured',
          'Gemini provider is temporarily unavailable.',
          ErrorSeverity.CRITICAL,
          false
        );
      }
      return {
        model: geminiClient.chat(
          webContentAnalyzerConfig.gemini.model
        ) as LanguageModel,
        temperature: webContentAnalyzerConfig.gemini.temperature,
        maxTokens: webContentAnalyzerConfig.gemini.maxTokens,
      };
    }
    case 'deepseek': {
      if (!deepseekClient) {
        throw new WebContentAnalyzerError(
          ErrorType.SERVICE_UNAVAILABLE,
          'DeepSeek API key is not configured',
          'DeepSeek provider is temporarily unavailable.',
          ErrorSeverity.CRITICAL,
          false
        );
      }
      return {
        model: deepseekClient.chat(
          webContentAnalyzerConfig.deepseek.model
        ) as LanguageModel,
        temperature: webContentAnalyzerConfig.deepseek.temperature,
        maxTokens: webContentAnalyzerConfig.deepseek.maxTokens,
      };
    }
    case 'openrouter': {
      if (!openRouterClient) {
        throw new WebContentAnalyzerError(
          ErrorType.SERVICE_UNAVAILABLE,
          'OpenRouter API key is not configured',
          'OpenRouter provider is temporarily unavailable.',
          ErrorSeverity.CRITICAL,
          false
        );
      }
      return {
        model: openRouterClient.chat(
          webContentAnalyzerConfig.openrouter.model
        ) as LanguageModel,
        temperature: webContentAnalyzerConfig.openrouter.temperature,
        maxTokens: webContentAnalyzerConfig.openrouter.maxTokens,
      };
    }
    default:
      throw new WebContentAnalyzerError(
        ErrorType.VALIDATION,
        'Invalid model provider',
        'Please select a valid model provider.',
        ErrorSeverity.MEDIUM,
        false
      );
  }
}
