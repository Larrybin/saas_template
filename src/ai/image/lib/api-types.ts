import { z } from 'zod';
import { PROVIDER_ORDER, type ProviderKey } from './provider-config';

export interface GenerateImageRequest {
  prompt: string;
  provider: ProviderKey;
  modelId: string;
}

export interface GenerateImageResponse {
  success: boolean;
  data?: {
    provider: ProviderKey;
    image: string;
  };
  error?: string;
  code?: string;
  retryable?: boolean;
}

export const generateImageRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  provider: z.enum(PROVIDER_ORDER as [ProviderKey, ...ProviderKey[]]),
  modelId: z.string().min(1, 'Model ID is required'),
});

export type GenerateImageRequestInput = z.infer<
  typeof generateImageRequestSchema
>;
