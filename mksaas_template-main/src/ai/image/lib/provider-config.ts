export type ProviderKey = 'replicate' | 'openai' | 'fireworks' | 'fal';
export type ModelMode = 'performance' | 'quality';

export const PROVIDERS: Record<
  ProviderKey,
  {
    displayName: string;
    iconPath: string;
    color: string;
    models: string[];
  }
> = {
  // https://ai-sdk.dev/providers/ai-sdk-providers/replicate#image-models
  replicate: {
    displayName: 'Replicate',
    iconPath: '/provider-icons/replicate.svg',
    color: 'from-purple-500 to-blue-500',
    models: [
      'black-forest-labs/flux-1.1-pro',
      'black-forest-labs/flux-1.1-pro-ultra',
      'black-forest-labs/flux-dev',
      'black-forest-labs/flux-pro',
      'black-forest-labs/flux-schnell',
      'ideogram-ai/ideogram-v2',
      'ideogram-ai/ideogram-v2-turbo',
      'luma/photon',
      'luma/photon-flash',
      'recraft-ai/recraft-v3',
      // 'recraft-ai/recraft-v3-svg', // added by Fox
      // 'stability-ai/stable-diffusion-3.5-medium', // added by Fox
      'stability-ai/stable-diffusion-3.5-large',
      'stability-ai/stable-diffusion-3.5-large-turbo',
    ],
  },
  // https://ai-sdk.dev/providers/ai-sdk-providers/openai#image-models
  openai: {
    displayName: 'OpenAI',
    iconPath: '/provider-icons/openai.svg',
    color: 'from-blue-500 to-cyan-500',
    models: [
      // 'gpt-image-1', // added by Fox
      'dall-e-2',
      'dall-e-3',
    ],
  },
  // https://ai-sdk.dev/providers/ai-sdk-providers/fireworks#image-models
  fireworks: {
    displayName: 'Fireworks',
    iconPath: '/provider-icons/fireworks.svg',
    color: 'from-orange-500 to-red-500',
    models: [
      'accounts/fireworks/models/flux-1-dev-fp8',
      'accounts/fireworks/models/flux-1-schnell-fp8',
      'accounts/fireworks/models/playground-v2-5-1024px-aesthetic',
      'accounts/fireworks/models/japanese-stable-diffusion-xl',
      'accounts/fireworks/models/playground-v2-1024px-aesthetic',
      'accounts/fireworks/models/SSD-1B',
      'accounts/fireworks/models/stable-diffusion-xl-1024-v1-0',
    ],
  },
  // https://ai-sdk.dev/providers/ai-sdk-providers/fal#image-models
  fal: {
    displayName: 'Fal',
    iconPath: '/provider-icons/fal.svg',
    color: 'from-orange-500 to-red-500',
    models: [
      'fal-ai/flux/dev', // added by Fox
      'fal-ai/flux-pro/kontext',
      'fal-ai/flux-pro/kontext/max',
      'fal-ai/flux-lora',
      'fal-ai/fast-sdxl',
      'fal-ai/flux-pro/v1.1-ultra',
      'fal-ai/ideogram/v2',
      'fal-ai/recraft-v3',
      'fal-ai/hyper-sdxl',
      // 'fal-ai/stable-diffusion-3.5-large',
    ],
  },
};

export const MODEL_CONFIGS: Record<ModelMode, Record<ProviderKey, string>> = {
  performance: {
    replicate: 'black-forest-labs/flux-1.1-pro',
    openai: 'dall-e-3',
    fireworks: 'accounts/fireworks/models/flux-1-schnell-fp8',
    fal: 'fal-ai/flux/dev',
  },
  quality: {
    replicate: 'stability-ai/stable-diffusion-3.5-large',
    openai: 'dall-e-3',
    fireworks: 'accounts/fireworks/models/flux-1-dev-fp8',
    fal: 'fal-ai/flux-pro/v1.1-ultra',
  },
};

export const PROVIDER_ORDER: ProviderKey[] = [
  'replicate',
  'openai',
  'fireworks',
  'fal',
];

export const initializeProviderRecord = <T>(defaultValue?: T) =>
  Object.fromEntries(
    PROVIDER_ORDER.map((key) => [key, defaultValue])
  ) as Record<ProviderKey, T>;
