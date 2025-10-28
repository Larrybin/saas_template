import { WebContentAnalyzer } from '@/ai/text/components/web-content-analyzer';
import { constructMetadata } from '@/lib/metadata';
import { getUrlWithLocale } from '@/lib/urls/urls';
import { BotIcon, FileTextIcon, GlobeIcon, ZapIcon } from 'lucide-react';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const pt = await getTranslations({ locale, namespace: 'AITextPage' });

  return constructMetadata({
    title: pt('title') + ' | ' + t('title'),
    description: pt('description'),
    canonicalUrl: getUrlWithLocale('/ai/text', locale),
  });
}

export default async function AITextPage() {
  const t = await getTranslations('AITextPage');

  return (
    <div className="min-h-screen bg-muted/50 rounded-lg">
      <div className="container mx-auto px-4 py-8 md:py-16">
        {/* Header Section */}
        <div className="text-center space-y-6 mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <ZapIcon className="size-4" />
            {t('title')}
          </div>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            {t('analyzer.title')}
          </h1>

          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            {t('subtitle')}
          </p>
        </div>

        {/* Web Content Analyzer Component */}
        <div className="max-w-6xl mx-auto">
          <WebContentAnalyzer className="w-full" />
        </div>

        {/* Features Section */}
        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center size-12 rounded-lg bg-blue-100 dark:bg-blue-900/20">
              <GlobeIcon className="size-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold">
              {t('features.scraping.title')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t('features.scraping.description')}
            </p>
          </div>

          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center size-12 rounded-lg bg-green-100 dark:bg-green-900/20">
              <BotIcon className="size-6 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-semibold">
              {t('features.analysis.title')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t('features.analysis.description')}
            </p>
          </div>

          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center size-12 rounded-lg bg-purple-100 dark:bg-purple-900/20">
              <FileTextIcon className="size-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold">
              {t('features.results.title')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t('features.results.description')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
