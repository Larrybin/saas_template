import { ImagePlayground } from '@/ai/image/components/ImagePlayground';
import { getRandomSuggestions } from '@/ai/image/lib/suggestions';
import { constructMetadata } from '@/lib/metadata';
import { getUrlWithLocale } from '@/lib/urls/urls';
import { ImageIcon } from 'lucide-react';
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
  const pt = await getTranslations({ locale, namespace: 'AIImagePage' });

  return constructMetadata({
    title: pt('title') + ' | ' + t('title'),
    description: pt('description'),
    canonicalUrl: getUrlWithLocale('/ai/image', locale),
  });
}

export default async function AIImagePage() {
  const t = await getTranslations('AIImagePage');

  return (
    <div className="min-h-screen bg-muted/50 rounded-lg">
      <div className="container mx-auto px-4 py-8 md:py-16">
        {/* Header Section */}
        <div className="text-center space-y-6 mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <ImageIcon className="size-4" />
            {t('title')}
          </div>
        </div>

        {/* Image Playground Component */}
        <div className="max-w-6xl mx-auto">
          <ImagePlayground suggestions={getRandomSuggestions(5)} />
        </div>
      </div>
    </div>
  );
}
