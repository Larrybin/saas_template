import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import BlogGridWithPagination from '@/components/blog/blog-grid-with-pagination';
import { websiteConfig } from '@/config/website';
import { LOCALES } from '@/i18n/routing';
import { getBlogData, isPublishedBlogPost } from '@/lib/blog/utils';
import { constructMetadata } from '@/lib/metadata';
import { blogSource } from '@/lib/source';
import { getUrlWithLocale } from '@/lib/urls/urls';

export function generateStaticParams() {
  const paginationSize = websiteConfig.blog.paginationSize;
  const params: { locale: string; page: string }[] = [];
  for (const locale of LOCALES) {
    const publishedPosts = blogSource
      .getPages(locale)
      .filter(isPublishedBlogPost);
    const totalPages = Math.max(
      1,
      Math.ceil(publishedPosts.length / paginationSize)
    );
    for (let pageNumber = 2; pageNumber <= totalPages; pageNumber++) {
      params.push({ locale, page: String(pageNumber) });
    }
  }
  return params;
}

export async function generateMetadata({ params }: BlogListPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const pt = await getTranslations({ locale, namespace: 'BlogPage' });

  return constructMetadata({
    title: `${pt('title')} | ${t('title')}`,
    description: pt('description'),
    canonicalUrl: getUrlWithLocale('/blog', locale),
  });
}

interface BlogListPageProps {
  params: Promise<{
    locale: Locale;
    page: string;
  }>;
}

export default async function BlogListPage({ params }: BlogListPageProps) {
  const { locale, page } = await params;
  const localePosts = blogSource.getPages(locale);
  const publishedPosts = localePosts.filter(isPublishedBlogPost);
  const sortedPosts = publishedPosts.sort((a, b) => {
    return (
      new Date(getBlogData(b).date).getTime() -
      new Date(getBlogData(a).date).getTime()
    );
  });
  const currentPage = Number(page);
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
      routePrefix={'/blog'}
    />
  );
}
