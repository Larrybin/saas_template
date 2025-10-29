/**
 * Web Content Analyzer Configuration
 *
 * This file contains configuration settings for the web content analyzer feature,
 * including credit costs and other operational parameters.
 */

export const webContentAnalyzerConfig = {
  /**
   * Maximum content length for AI analysis (in characters)
   * Optimized to prevent token limit issues while maintaining quality
   */
  maxContentLength: 8000,

  /**
   * Content truncation settings for performance optimization
   */
  contentTruncation: {
    /**
     * Preferred truncation point as percentage of max length
     * Try to truncate at sentence boundaries when possible
     */
    preferredTruncationPoint: 0.8,

    /**
     * Minimum content length to consider for truncation
     */
    minContentLength: 1000,

    /**
     * Maximum number of sentences to preserve when truncating
     */
    maxSentences: 50,
  },

  /**
   * Request timeout in milliseconds
   */
  timeoutMillis: 55 * 1000, // 55 seconds

  /**
   * Performance optimization settings
   */
  performance: {
    /**
     * Debounce delay for URL input (in milliseconds)
     */
    urlInputDebounceMs: 500,

    /**
     * Image lazy loading threshold (intersection observer)
     */
    lazyLoadingThreshold: 0.1,

    /**
     * Maximum number of retry attempts for failed requests
     */
    maxRetryAttempts: 3,

    /**
     * Delay between retry attempts (in milliseconds)
     */
    retryDelayMs: 1000,
  },

  /**
   * Firecrawl API configuration and scraping options
   */
  firecrawl: {
    // API Configuration
    apiKey: process.env.FIRECRAWL_API_KEY,
    baseUrl: 'https://api.firecrawl.dev',

    // Default scraping options
    formats: ['markdown', 'screenshot'],
    includeTags: ['title', 'meta', 'h1', 'h2', 'h3', 'p', 'article'],
    excludeTags: ['script', 'style', 'nav', 'footer', 'aside'],
    onlyMainContent: true,
    waitFor: 2000,

    // Screenshot optimization settings
    screenshot: {
      quality: 80, // Reduce quality for faster loading
      fullPage: false, // Only capture viewport for performance
    },

    // Rate limiting and timeout settings
    rateLimit: {
      maxConcurrentRequests: 3,
      requestDelay: 1000, // 1 second between requests
    },

    // Maximum content size (in characters)
    maxContentSize: 100000, // 100KB of text content
  },

  /**
   * AI model providers
   */
  openai: {
    model: 'gpt-4o-mini',
    temperature: 0.1, // Low temperature for consistent results
    maxTokens: 2000, // Limit response tokens for performance
  },
  gemini: {
    model: 'gemini-2.0-flash',
    temperature: 0.1,
    maxTokens: 2000,
  },
  deepseek: {
    model: 'deepseek-chat',
    temperature: 0.1,
    maxTokens: 2000,
  },
  openrouter: {
    // model: 'openrouter/horizon-beta',
    // model: 'x-ai/grok-3-beta',
    // model: 'openai/gpt-4o-mini',
    model: 'deepseek/deepseek-r1:free',
    temperature: 0.1,
    maxTokens: 2000,
  },
} as const;

/**
 * Validates if the Firecrawl API key is configured
 */
export function validateFirecrawlConfig(): boolean {
  if (!webContentAnalyzerConfig.firecrawl.apiKey) {
    console.warn(
      'FIRECRAWL_API_KEY is not configured. Web content analysis features will not work.'
    );
    return false;
  }
  return true;
}

/**
 * Validate if the web content analyzer is properly configured
 */
export function validateWebContentAnalyzerConfig(): boolean {
  return (
    typeof webContentAnalyzerConfig.maxContentLength === 'number' &&
    webContentAnalyzerConfig.maxContentLength > 0 &&
    typeof webContentAnalyzerConfig.timeoutMillis === 'number' &&
    webContentAnalyzerConfig.timeoutMillis > 0
  );
}
