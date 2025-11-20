import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAiErrorUi } from '@/hooks/use-ai-error-ui';
import {
  handleAuthFromEnvelope,
  useAuthErrorHandler,
} from '@/hooks/use-auth-error-handler';
import { getDomainErrorMessage } from '@/lib/domain-error-utils';
import type { GenerateImageResponse } from '../lib/api-types';
import type {
  ImageError,
  ImageResult,
  ProviderTiming,
} from '../lib/image-types';
import {
  initializeProviderRecord,
  type ProviderKey,
} from '../lib/provider-config';

interface UseImageGenerationReturn {
  images: ImageResult[];
  errors: ImageError[];
  timings: Record<ProviderKey, ProviderTiming>;
  failedProviders: ProviderKey[];
  isLoading: boolean;
  startGeneration: (
    prompt: string,
    providers: ProviderKey[],
    providerToModel: Record<ProviderKey, string>
  ) => Promise<void>;
  resetState: () => void;
  activePrompt: string;
}

export function useImageGeneration(): UseImageGenerationReturn {
  const [images, setImages] = useState<ImageResult[]>([]);
  const [errors, setErrors] = useState<ImageError[]>([]);
  const [timings, setTimings] = useState<Record<ProviderKey, ProviderTiming>>(
    initializeProviderRecord<ProviderTiming>()
  );
  const [failedProviders, setFailedProviders] = useState<ProviderKey[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activePrompt, setActivePrompt] = useState('');
  const t = useTranslations();
  const handleAuthError = useAuthErrorHandler();
  const { handleAiError } = useAiErrorUi();

  const resetState = () => {
    setImages([]);
    setErrors([]);
    setTimings(initializeProviderRecord<ProviderTiming>());
    setFailedProviders([]);
    setIsLoading(false);
  };

  const startGeneration = async (
    prompt: string,
    providers: ProviderKey[],
    providerToModel: Record<ProviderKey, string>
  ) => {
    setActivePrompt(prompt);
    try {
      setIsLoading(true);
      // Initialize images array with null values
      setImages(
        providers.map((provider) => ({
          provider,
          image: null,
          modelId: providerToModel[provider],
        }))
      );

      // Clear previous state
      setErrors([]);
      setFailedProviders([]);

      // Initialize timings with start times
      const now = Date.now();
      setTimings(
        Object.fromEntries(
          providers.map((provider) => [provider, { startTime: now }])
        ) as Record<ProviderKey, ProviderTiming>
      );

      // Helper to fetch a single provider
      const generateImage = async (provider: ProviderKey, modelId: string) => {
        const startTime = now;
        console.log(
          `Generate image request [provider=${provider}, modelId=${modelId}]`
        );
        try {
          const request = {
            prompt,
            provider,
            modelId,
          };

          const response = await fetch('/api/generate-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
          });
          const data = (await response.json()) as GenerateImageResponse;

          if (response.status === 401) {
            handleAuthFromEnvelope(handleAuthError, {
              code: data.code,
              error: data.error,
            });
          }

          if (!response.ok || !data.success || !data.data) {
            const errorMessage =
              data.error ||
              `Server error: ${response.status} ${response.statusText}`;

            const error = new Error(errorMessage) as Error & {
              code?: string;
              retryable?: boolean;
            };
            if (data.code) {
              error.code = data.code;
            }
            if (typeof data.retryable === 'boolean') {
              error.retryable = data.retryable;
            }

            throw error;
          }

          const completionTime = Date.now();
          const elapsed = completionTime - startTime;
          setTimings((prev) => ({
            ...prev,
            [provider]: {
              startTime,
              completionTime,
              elapsed,
            },
          }));

          console.log(
            `Successful image response [provider=${provider}, modelId=${modelId}, elapsed=${elapsed}ms]`
          );

          // Update image in state
          setImages((prevImages) =>
            prevImages.map((item) =>
              item.provider === provider
                ? { ...item, image: data.data?.image ?? null, modelId }
                : item
            )
          );
        } catch (err) {
          console.error(
            `Error [provider=${provider}, modelId=${modelId}]:`,
            err
          );

          const errorObject = err as Error & {
            code?: string;
            retryable?: boolean;
          };

          const resolvedMessage = getDomainErrorMessage(
            errorObject.code,
            (key) => t(key as Parameters<typeof t>[0]),
            errorObject instanceof Error && errorObject.message
              ? errorObject.message
              : 'Failed to generate image. Please try again.'
          );

          handleAiError(
            {
              ...(errorObject.code ? { code: errorObject.code } : {}),
              message: resolvedMessage,
            },
            { source: 'image' }
          );

          setFailedProviders((prev) => [...prev, provider]);
          setErrors((prev) => [
            ...prev,
            {
              provider,
              message: resolvedMessage,
              ...(errorObject.code ? { code: errorObject.code } : {}),
              ...(typeof errorObject.retryable === 'boolean'
                ? { retryable: errorObject.retryable }
                : {}),
            },
          ]);

          setImages((prevImages) =>
            prevImages.map((item) =>
              item.provider === provider
                ? { ...item, image: null, modelId }
                : item
            )
          );
        }
      };

      // Generate images for all active providers
      const fetchPromises = providers.map((provider) => {
        const modelId = providerToModel[provider];
        return generateImage(provider, modelId);
      });

      await Promise.all(fetchPromises);
    } catch (error) {
      console.error('Error fetching images:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    images,
    errors,
    timings,
    failedProviders,
    isLoading,
    startGeneration,
    resetState,
    activePrompt,
  };
}
