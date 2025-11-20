import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Callout } from 'fumadocs-ui/components/callout';
import { File, Files, Folder } from 'fumadocs-ui/components/files';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import * as LucideIcons from 'lucide-react';
import type { MDXComponents } from 'mdx/types';
import type { ComponentProps, ComponentType } from 'react';
import { ImageWrapper } from '@/components/docs/image-wrapper';
import { Wrapper } from '@/components/docs/wrapper';
import { YoutubeVideo } from '@/components/docs/youtube-video';

/**
 * Enhanced MDX Content component that includes commonly used MDX components
 * It can be used for blog posts, documentation, and custom pages
 */
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  // Start with default components
  const baseComponents: MDXComponents = {
    ...defaultMdxComponents,
    ...(LucideIcons as unknown as Record<string, ComponentType<unknown>>),
    YoutubeVideo,
    Tabs,
    Tab,
    TypeTable,
    Accordion,
    Accordions,
    Steps,
    Step,
    Wrapper,
    File,
    Folder,
    Files,
    blockquote: Callout as unknown as ComponentType<
      ComponentProps<'blockquote'>
    >,
    img: ImageWrapper,
  };

  return {
    ...baseComponents,
    ...components,
  };
}
