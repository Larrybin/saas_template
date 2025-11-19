import type { BlogType } from '@/lib/source';
import EmptyGrid from '../shared/empty-grid';
import CustomPagination from '../shared/pagination';
import BlogGrid from './blog-grid';

interface BlogGridWithPaginationProps {
  locale: string;
  posts: BlogType[];
  totalPages: number;
  routePrefix: string;
}

export default function BlogGridWithPagination({
  locale,
  posts,
  totalPages,
  routePrefix,
}: BlogGridWithPaginationProps) {
  return (
    <div>
      {posts.length === 0 && <EmptyGrid />}
      {posts.length > 0 && (
        <div>
          <BlogGrid locale={locale} posts={posts} />
          <div className="mt-8 flex items-center justify-center">
            <CustomPagination
              routePrefix={routePrefix}
              totalPages={totalPages}
            />
          </div>
        </div>
      )}
    </div>
  );
}
