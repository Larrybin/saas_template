import { afterEach, describe, expect, it, vi } from 'vitest';

const buildMockEnv = (overrides: Partial<Record<string, string>>) => ({
  serverEnv: {
    ai: {
      openaiApiKey: overrides.openaiApiKey,
      googleGenerativeAiApiKey: overrides.googleGenerativeAiApiKey,
      deepseekApiKey: overrides.deepseekApiKey,
      openrouterApiKey: overrides.openrouterApiKey,
    },
  },
});

describe('provider-factory', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@/env/server');
  });

  it('resolves OpenAI provider when API key is configured', async () => {
    vi.doMock('@/env/server', () =>
      buildMockEnv({
        openaiApiKey: 'sk-openai',
      })
    );
    const module = await import('../provider-factory');
    const config = module.resolveProviderConfig('openai');
    expect(config.model).toBeDefined();
    expect(config.temperature).toBeDefined();
  });

  it('throws descriptive error when OpenAI key is missing', async () => {
    vi.doMock('@/env/server', () => buildMockEnv({}));
    const module = await import('../provider-factory');
    expect(() => module.resolveProviderConfig('openai')).toThrow(
      'OpenAI API key is not configured'
    );
  });
});
