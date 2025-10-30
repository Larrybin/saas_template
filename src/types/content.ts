import type { StructuredData } from 'fumadocs-core/mdx-plugins';
import type { TableOfContents } from 'fumadocs-core/server';
import type { PageData } from 'fumadocs-core/source';
import type { MDXContent } from 'mdx/types';

/**
 * Common fields that every markdown-based entry receives from fumadocs.
 * These augment the frontmatter defined in the MDX files.
 */
export interface MarkdownEntryFields {
  body: MDXContent;
  toc: TableOfContents;
  structuredData: StructuredData;
  _exports: Record<string, unknown>;
  /**
   * Absolute and relative path to the MDX source file.
   */
  _file: {
    path: string;
    absolutePath: string;
  };
  /**
   * Original content and last modification metadata are optional depending on loader settings.
   */
  content?: string;
  lastModified?: Date;
}

type BaseMarkdownFrontmatter = PageData & MarkdownEntryFields;

export interface BlogFrontmatter extends BaseMarkdownFrontmatter {
  date: string;
  published: boolean;
  categories: string[];
  author: string;
  image: string;
  readingTime?: string;
}

export interface BlogCategoryFrontmatter extends BaseMarkdownFrontmatter {
  name: string;
  description: string;
}

export interface BlogAuthorFrontmatter extends BaseMarkdownFrontmatter {
  name: string;
  avatar: string;
  role?: string;
}

export interface ChangelogFrontmatter extends BaseMarkdownFrontmatter {
  date: string;
  published: boolean;
  version: string;
}

export interface MarketingPageFrontmatter extends BaseMarkdownFrontmatter {
  date?: string;
  published?: boolean;
}

export type BlogDocEntry = BlogFrontmatter;
export type BlogCategoryEntry = BlogCategoryFrontmatter;
export type BlogAuthorEntry = BlogAuthorFrontmatter;
export type ChangelogEntry = ChangelogFrontmatter;
export type MarketingPageEntry = MarketingPageFrontmatter;
