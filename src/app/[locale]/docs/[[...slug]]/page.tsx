import Link from 'fumadocs-core/link';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import type { ComponentPropsWithoutRef, ComponentType, ReactNode } from 'react';
import * as Preview from '@/components/docs';
import { getMDXComponents } from '@/components/docs/mdx-components';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { LOCALES } from '@/i18n/routing';
import { constructMetadata } from '@/lib/metadata';
import { source } from '@/lib/source';
import { getUrlWithLocale } from '@/lib/urls/urls';

const getVirtualDir = (path: string): string | undefined => {
  const segments = path.split('/');
  return segments.length > 1 ? segments.slice(0, -1).join('/') : undefined;
};

export function generateStaticParams() {
  const slugParams = source.generateParams();
  const params = LOCALES.flatMap((locale) =>
    slugParams.map((param) => ({
      locale,
      slug: param.slug,
    }))
  );

  return params;
}

export async function generateMetadata({ params }: DocPageProps) {
  const { slug, locale } = await params;
  const language = locale as string;
  const page = source.getPage(slug, language);
  if (!page) {
    console.warn('docs page not found', slug, language);
    notFound();
  }

  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return constructMetadata({
    title: `${page.data.title} | ${t('title')}`,
    description: page.data.description,
    canonicalUrl: getUrlWithLocale(`/docs/${page.slugs.join('/')}`, locale),
  });
}

const previewComponents: Record<string, ComponentType> = {
  ...Preview,
};

function PreviewRenderer({ preview }: { preview: string }): ReactNode {
  if (preview && preview in Preview) {
    const Comp = previewComponents[preview];
    return <Comp />;
  }

  return null;
}

export const revalidate = false;

interface DocPageProps {
  params: Promise<{
    slug?: string[];
    locale: Locale;
  }>;
}

/**
 * Doc Page
 *
 * ref:
 * https://github.com/fuma-nama/fumadocs/blob/dev/apps/docs/app/docs/%5B...slug%5D/page.tsx
 */
export default async function DocPage({ params }: DocPageProps) {
  const { slug, locale } = await params;
  const language = locale as string;
  const page = source.getPage(slug, language);

  if (!page) {
    console.warn('docs page not found', slug, language);
    notFound();
  }

  const preview = page.data.preview;

  const MDX = page.data.body;
  const pageDir = getVirtualDir(page.path);

  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      tableOfContent={{
        style: 'clerk',
      }}
    >
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        {/* Preview Rendered Component */}
        {preview ? <PreviewRenderer preview={preview} /> : null}

        {/* MDX Content */}
        <MDX
          components={getMDXComponents({
            a: ({ href, ...props }: ComponentPropsWithoutRef<'a'>) => {
              const found = source.getPageByHref(
                href ?? '',
                pageDir ? { dir: pageDir } : undefined
              );

              if (!found) return <Link href={href} {...props} />;

              return (
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <Link
                      href={
                        found.hash
                          ? `${found.page.url}#${found.hash}`
                          : found.page.url
                      }
                      {...props}
                    />
                  </HoverCardTrigger>
                  <HoverCardContent className="text-sm">
                    <p className="font-medium">{found.page.data.title}</p>
                    <p className="text-fd-muted-foreground">
                      {found.page.data.description}
                    </p>
                  </HoverCardContent>
                </HoverCard>
              );
            },
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}
