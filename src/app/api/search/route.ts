import { createTokenizer } from '@orama/tokenizers/mandarin';
import { createI18nSearchAPI } from 'fumadocs-core/search/server';
import { NextResponse } from 'next/server';
import { docsI18nConfig } from '@/lib/docs/i18n';
import { ErrorCodes } from '@/lib/server/error-codes';
import { createLoggerFromHeaders } from '@/lib/server/logger';
import { source } from '@/lib/source';

/**
 * Fumadocs i18n search configuration
 *
 * 1. For internationalization, use createI18nSearchAPI:
 * https://fumadocs.dev/docs/headless/search/orama#internationalization
 *
 * 2. For special languages like Chinese, configure custom tokenizers:
 * https://fumadocs.dev/docs/headless/search/orama#special-languages
 * https://docs.orama.com/open-source/supported-languages/using-chinese-with-orama
 */
const searchAPI = createI18nSearchAPI('advanced', {
  // Pass the i18n config for proper language detection
  i18n: docsI18nConfig,

  // Get all pages from all languages and map them to search indexes
  indexes: source.getLanguages().flatMap(({ language, pages }) =>
    pages.map((page) => ({
      title: page.data.title,
      description: page.data.description ?? '',
      structuredData: page.data.structuredData,
      id: page.url,
      url: page.url,
      locale: language,
    }))
  ),

  // Configure special language tokenizers and search options
  localeMap: {
    // Chinese configuration with Mandarin tokenizer
    zh: {
      components: {
        tokenizer: createTokenizer(),
      },
      search: {
        // Lower threshold for better matches with Chinese text
        threshold: 0,
        // Lower tolerance for better precision
        tolerance: 0,
      },
    },

    // Use the default English tokenizer for English content
    en: 'english',
  },

  // Global search configuration
  search: {
    limit: 20,
  },
});

/**
 * Fumadocs 15.2.8 fixed the bug that the `locale` is not passed to the search API
 *
 * ref:
 * https://x.com/indie_maker_fox/status/1913457083997192589
 *
 * NOTICE:
 * Fumadocs 15.1.2 has a bug that the `locale` is not passed to the search API
 * 1. Wrap the GET handler for debugging docs search
 * 2. Detect locale from referer header, and add the locale parameter to the search API
 * 3. Fumadocs core searchAPI get `locale` from searchParams, and pass it to the search API
 * https://github.com/fuma-nama/fumadocs/blob/dev/packages/core/src/search/orama/create-endpoint.ts#L19
 */
export const GET = async (request: Request) => {
  const logger = createLoggerFromHeaders(request.headers, {
    span: 'api.docs.search',
    route: '/api/search',
  });

  const url = new URL(request.url);
  const query = url.searchParams.get('q') ?? undefined;
  const locale = url.searchParams.get('locale') ?? undefined;
  const queryLength = typeof query === 'string' ? query.length : undefined;

  logger.info(
    {
      queryLength,
      locale,
    },
    'Docs search request'
  );

  try {
    const response = await searchAPI.GET(request);
    const payload = await response.json();

    if (!response.ok) {
      logger.error(
        { status: response.status, payload, query, queryLength, locale },
        'Docs search provider error'
      );

      const retryable = response.status >= 500;
      return NextResponse.json(
        {
          success: false,
          error: 'Docs search failed',
          code: ErrorCodes.DocsSearchFailed,
          retryable,
        },
        { status: response.status }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: payload,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error(
      { error, query, queryLength, locale },
      'Docs search request failed'
    );

    return NextResponse.json(
      {
        success: false,
        error: 'Docs search failed',
        code: ErrorCodes.DocsSearchFailed,
        retryable: true,
      },
      { status: 500 }
    );
  }
};
