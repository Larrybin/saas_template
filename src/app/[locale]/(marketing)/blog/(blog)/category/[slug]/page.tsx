import { notFound } from 'next/navigation';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import BlogGridWithPagination from '@/components/blog/blog-grid-with-pagination';
import { websiteConfig } from '@/config/website';
import { LOCALES } from '@/i18n/routing';
import { getBlogData, isPublishedBlogPost } from '@/lib/blog/utils';
import { constructMetadata } from '@/lib/metadata';
import { blogSource, categorySource } from '@/lib/source';
import { getUrlWithLocale } from '@/lib/urls/urls';

// Generate all static params for SSG (locale + category)
export function generateStaticParams() {
  const params: { locale: string; slug: string }[] = [];
  for (const locale of LOCALES) {
    const localeCategories = categorySource
      .getPages(locale)
      .filter((category) => category.locale === locale);
    for (const category of localeCategories) {
      const [firstSlug] = category.slugs;
      if (!firstSlug) continue;
      params.push({ locale, slug: firstSlug });
    }
  }
  return params;
}

// Generate metadata for each static category page (locale + category)
export async function generateMetadata({ params }: BlogCategoryPageProps) {
  const { locale, slug } = await params;
  const category = categorySource.getPage([slug], locale);
  if (!category) {
    notFound();
  }
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const canonicalPath = `/blog/category/${slug}`;

  const description = category.data.description;

  return constructMetadata({
    title: `${category.data.name} | ${t('title')}`,
    ...(description ? { description } : {}),
    canonicalUrl: getUrlWithLocale(canonicalPath, locale),
  });
}

interface BlogCategoryPageProps {
  params: Promise<{
    locale: Locale;
    slug: string;
  }>;
}

export default async function BlogCategoryPage({
  params,
}: BlogCategoryPageProps) {
  const { locale, slug } = await params;
  const category = categorySource.getPage([slug], locale);
  if (!category) {
    notFound();
  }

  const localePosts = blogSource.getPages(locale);
  const publishedPosts = localePosts.filter(isPublishedBlogPost);
  const [firstSlug] = category.slugs;
  if (!firstSlug) {
    notFound();
  }

  const filteredPosts = publishedPosts.filter((post) =>
    getBlogData(post).categories.some((cat) => cat === firstSlug)
  );
  const sortedPosts = filteredPosts.sort((a, b) => {
    return (
      new Date(getBlogData(b).date).getTime() -
      new Date(getBlogData(a).date).getTime()
    );
  });
  const currentPage = 1;
  const blogPageSize = websiteConfig.blog.paginationSize;
  const paginatedLocalePosts = sortedPosts.slice(
    (currentPage - 1) * blogPageSize,
    currentPage * blogPageSize
  );
  const totalPages = Math.ceil(sortedPosts.length / blogPageSize);

  return (
    <BlogGridWithPagination
      locale={locale}
      posts={paginatedLocalePosts}
      totalPages={totalPages}
      routePrefix={`/blog/category/${slug}`}
    />
  );
}
