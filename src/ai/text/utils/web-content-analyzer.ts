import { z } from 'zod';

// Core Analysis Results Interface
export interface AnalysisResults {
  title: string;
  description: string;
  introduction: string;
  features: string[];
  pricing: string;
  useCases: string[];
  url: string;
  analyzedAt: string;
}

// API Request/Response Interfaces
export interface AnalyzeContentRequest {
  url: string;
  modelProvider: ModelProvider;
}

export interface AnalyzeContentResponse {
  success: boolean;
  data?: {
    analysis: AnalysisResults;
    screenshot?: string;
  };
  error?: string;
  creditsConsumed?: number;
}

// Firecrawl Response Type Definitions
export interface FirecrawlResponse {
  success: boolean;
  data?: {
    markdown: string;
    screenshot?: string;
    metadata?: {
      title?: string;
      description?: string;
      url?: string;
      ogTitle?: string;
      ogDescription?: string;
      ogImage?: string;
    };
  };
  error?: string;
}

export interface FirecrawlScrapeOptions {
  formats?: ('markdown' | 'html' | 'rawHtml' | 'screenshot')[];
  includeTags?: string[];
  excludeTags?: string[];
  onlyMainContent?: boolean;
  screenshot?: boolean;
  fullPageScreenshot?: boolean;
  waitFor?: number;
}

// Analysis State Interface for Component State Management
export interface AnalysisState {
  url: string;
  isLoading: boolean;
  loadingStage: 'scraping' | 'analyzing' | null;
  results: AnalysisResults | null;
  error: string | null;
  screenshot?: string;
}

// Component Props Interfaces
export type ModelProvider = 'openai' | 'gemini' | 'deepseek' | 'openrouter';

export interface WebContentAnalyzerProps {
  className?: string;
  modelProvider?: ModelProvider;
}

export interface UrlInputFormProps {
  onSubmit: (url: string, modelProvider: ModelProvider) => void;
  isLoading: boolean;
  disabled?: boolean;
  modelProvider: ModelProvider;
  setModelProvider: (provider: ModelProvider) => void;
}

export interface AnalysisResultsProps {
  results: AnalysisResults;
  screenshot?: string;
  onNewAnalysis: () => void;
}

export interface LoadingStatesProps {
  stage: 'scraping' | 'analyzing';
  url?: string;
}

// Zod Validation Schemas

// URL Validation Schema
export const urlSchema = z
  .url()
  .min(1, 'URL is required')
  .refine(
    (url) => url.startsWith('http://') || url.startsWith('https://'),
    'URL must start with http:// or https://'
  );

// Analysis Results Schema
export const analysisResultsSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  introduction: z.string().min(1, 'Introduction is required'),
  features: z.array(z.string()).default([]),
  pricing: z.string().default('Not specified'),
  useCases: z.array(z.string()).default([]),
  url: urlSchema,
  analyzedAt: z.iso.datetime(),
});

// API Request Schema
export const analyzeContentRequestSchema = z.object({
  url: urlSchema,
  modelProvider: z.enum(['openai', 'gemini', 'deepseek', 'openrouter']),
});

// API Response Schema
export const analyzeContentResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      analysis: analysisResultsSchema,
      screenshot: z.string().optional(),
    })
    .optional(),
  error: z.string().optional(),
  creditsConsumed: z.number().optional(),
});

// Firecrawl Response Schema
export const firecrawlResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      markdown: z.string(),
      screenshot: z.string().optional(),
      metadata: z
        .object({
          title: z.string().optional(),
          description: z.string().optional(),
          url: z.string().optional(),
          ogTitle: z.string().optional(),
          ogDescription: z.string().optional(),
          ogImage: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  error: z.string().optional(),
});

// Firecrawl Scrape Options Schema
export const firecrawlScrapeOptionsSchema = z.object({
  formats: z
    .array(z.enum(['markdown', 'html', 'rawHtml', 'screenshot']))
    .optional(),
  includeTags: z.array(z.string()).optional(),
  excludeTags: z.array(z.string()).optional(),
  onlyMainContent: z.boolean().optional(),
  screenshot: z.boolean().optional(),
  fullPageScreenshot: z.boolean().optional(),
  waitFor: z.number().optional(),
});

// Type exports for Zod inferred types
export type UrlInput = z.infer<typeof urlSchema>;
export type AnalyzeContentRequestInput = z.infer<
  typeof analyzeContentRequestSchema
>;
export type AnalyzeContentResponseInput = z.infer<
  typeof analyzeContentResponseSchema
>;
export type FirecrawlResponseInput = z.infer<typeof firecrawlResponseSchema>;
export type FirecrawlScrapeOptionsInput = z.infer<
  typeof firecrawlScrapeOptionsSchema
>;

// Validation helper functions
export const validateUrl = (url: string) => {
  return urlSchema.safeParse(url);
};

export const validateAnalyzeContentRequest = (data: unknown) => {
  return analyzeContentRequestSchema.safeParse(data);
};

export const validateAnalyzeContentResponse = (data: unknown) => {
  return analyzeContentResponseSchema.safeParse(data);
};

export const validateFirecrawlResponse = (data: unknown) => {
  return firecrawlResponseSchema.safeParse(data);
};

export const validateAnalysisResults = (data: unknown) => {
  return analysisResultsSchema.safeParse(data);
};
