import BlogCard, { BlogCardSkeleton } from '@/components/blog/blog-card';
import { websiteConfig } from '@/config/website';
import type { BlogType } from '@/lib/source';

interface BlogGridProps {
  locale: string;
  posts: BlogType[];
}

export default function BlogGrid({ locale, posts }: BlogGridProps) {
  // console.log('BlogGrid, posts', posts);
  return (
    <div>
      {posts?.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {posts.map((post) => (
            <BlogCard key={post.slugs.join('/')} locale={locale} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}

export function BlogGridSkeleton({
  count = websiteConfig.blog.paginationSize,
}: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {[...Array(count)].map((_, index) => (
        <BlogCardSkeleton key={index} />
      ))}
    </div>
  );
}
