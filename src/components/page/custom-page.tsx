import { formatDate } from '@/lib/formatter';
import type { PagesType } from '@/lib/source';
import { CalendarIcon } from 'lucide-react';
import { getMDXComponents } from '../docs/mdx-components';
import { Card, CardContent } from '../ui/card';

interface CustomPageProps {
  page: PagesType;
}

export function CustomPage({ page }: CustomPageProps) {
  const { title, description, date } = page.data;
  const formattedDate = formatDate(new Date(date));
  const MDX = page.data.body;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <h1 className="text-center text-3xl font-bold tracking-tight">
          {title}
        </h1>
        <p className="text-center text-lg text-muted-foreground">
          {description}
        </p>
        <div className="flex items-center justify-center gap-2">
          <CalendarIcon className="size-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{formattedDate}</p>
        </div>
      </div>

      {/* Content */}
      <Card className="mb-8">
        <CardContent>
          <div className="max-w-none prose prose-neutral dark:prose-invert prose-img:rounded-lg">
            <MDX components={getMDXComponents()} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
