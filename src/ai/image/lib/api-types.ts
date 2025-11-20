import type { ProviderKey } from './provider-config';

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
