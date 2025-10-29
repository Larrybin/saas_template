import { BlogCategoryFilter } from '@/components/blog/blog-category-filter';
import Container from '@/components/layout/container';
import { categorySource } from '@/lib/source';
import { getTranslations } from 'next-intl/server';
import type { PropsWithChildren } from 'react';

interface BlogListLayoutProps extends PropsWithChildren {
  params: Promise<{ locale: string }>;
}

export default async function BlogListLayout({
  children,
  params,
}: BlogListLayoutProps) {
  const { locale } = await params;
  const t = await getTranslations('BlogPage');

  // Filter categories by locale
  const language = locale as string;
  const categoryList = categorySource.getPages(language).map((category) => ({
    slug: category.slugs[0],
    name: category.data.name,
    description: category.data.description || '',
  }));
  // console.log('categoryList', categoryList);

  return (
    <div className="mb-16">
      <div className="mt-8 w-full flex flex-col items-center justify-center gap-8">
        {/* Header */}
        <div className="space-y-4">
          <h1 className="text-center text-3xl font-bold tracking-tight">
            {t('title')}
          </h1>
          <h2 className="text-center text-lg text-muted-foreground">
            {t('subtitle')}
          </h2>
        </div>

        <BlogCategoryFilter categoryList={categoryList} />
      </div>

      <Container className="mt-8 px-4">{children}</Container>
    </div>
  );
}
