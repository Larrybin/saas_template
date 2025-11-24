import Firecrawl from '@mendable/firecrawl-js';

import {
  classifyError,
  ErrorSeverity,
  ErrorType,
  WebContentAnalyzerError,
  withRetry,
} from '@/ai/text/utils/error-handling';
import { webContentAnalyzerConfig } from '@/ai/text/utils/web-content-config.client';
import {
  getFirecrawlApiKey,
  webContentAnalyzerServerConfig,
} from '@/ai/text/utils/web-content-config.server';

const MAX_CONTENT_LENGTH = webContentAnalyzerConfig.maxContentLength;

const getFirecrawlClient = () => {
  const apiKey = getFirecrawlApiKey();
  return new Firecrawl({
    apiKey,
    apiUrl: webContentAnalyzerServerConfig.firecrawl.baseUrl,
  });
};

export const truncateContent = (content: string, maxLength: number): string => {
  if (content.length <= maxLength) {
    return content;
  }

  const { contentTruncation } = webContentAnalyzerConfig;
  const preferredLength = Math.floor(
    maxLength * contentTruncation.preferredTruncationPoint
  );

  if (content.length < contentTruncation.minContentLength) {
    return `${content.substring(0, maxLength)}...`;
  }

  const truncated = content.substring(0, preferredLength);

  const sentences = content.split(/[.!?]+/);
  if (sentences.length > 1) {
    let sentenceLength = 0;
    let sentenceCount = 0;

    for (const sentence of sentences) {
      const nextLength = sentenceLength + sentence.length + 1;

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
      return `${sentences.slice(0, sentenceCount).join('.')}.`;
    }
  }

  const paragraphs = content.split(/\n\s*\n/);
  if (paragraphs.length > 1) {
    let paragraphLength = 0;

    for (const [index, paragraph] of paragraphs.entries()) {
      const nextLength = paragraphLength + paragraph.length + 2;

      if (nextLength > maxLength) {
        break;
      }

      paragraphLength = nextLength;

      if (paragraphLength > preferredLength) {
        return paragraphs.slice(0, index + 1).join('\n\n');
      }
    }
  }

  const words = truncated.split(' ');
  const lastCompleteWord = words.slice(0, -1).join(' ');

  if (lastCompleteWord.length > preferredLength) {
    return `${lastCompleteWord}...`;
  }

  return `${content.substring(0, maxLength)}...`;
};

export async function scrapeWebpage(
  url: string
): Promise<{ content: string; screenshot?: string }> {
  return withRetry(async () => {
    const firecrawl = getFirecrawlClient();
    const firecrawlOptions = webContentAnalyzerServerConfig.firecrawl;

    try {
      const scrapeResponse = await firecrawl.scrape(url, {
        formats: Array.from(firecrawlOptions.formats),
        includeTags: Array.from(firecrawlOptions.includeTags),
        excludeTags: Array.from(firecrawlOptions.excludeTags),
        onlyMainContent: firecrawlOptions.onlyMainContent,
        waitFor: firecrawlOptions.waitFor,
      });

      const content = scrapeResponse.markdown ?? '';
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
        ...(screenshot ? { screenshot } : {}),
      };
    } catch (error) {
      if (error instanceof WebContentAnalyzerError) {
        throw error;
      }

      throw classifyError(error);
    }
  });
}
