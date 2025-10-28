import { XTwitterIcon } from '@/components/icons/x';
import { Logo } from '@/components/layout/logo';
import { ModeSwitcher } from '@/components/layout/mode-switcher';
import { websiteConfig } from '@/config/website';
import { docsI18nConfig } from '@/lib/docs/i18n';
import { source } from '@/lib/source';
import { getUrlWithLocale } from '@/lib/urls/urls';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { HomeIcon } from 'lucide-react';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import '@/styles/mdx.css';

interface DocsLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: Locale }>;
}

/**
 * 1. Configure navigation
 * https://fumadocs.dev/docs/ui/navigation/links
 * https://fumadocs.dev/docs/ui/navigation/sidebar
 *
 * ref:
 * https://github.com/fuma-nama/fumadocs/blob/dev/apps/docs/app/layout.config.tsx
 *
 * 2. Organizing Pages
 * https://fumadocs.dev/docs/ui/page-conventions
 *
 * ref:
 * https://github.com/fuma-nama/fumadocs/blob/dev/apps/docs/content/docs/ui/meta.json
 */
export default async function DocsRootLayout({
  children,
  params,
}: DocsLayoutProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'DocsPage' });

  // Docs layout configurations
  const showLocaleSwitch = Object.keys(websiteConfig.i18n.locales).length > 1;
  const docsOptions: BaseLayoutProps = {
    i18n: showLocaleSwitch ? docsI18nConfig : undefined,
    githubUrl: websiteConfig.metadata.social?.github ?? undefined,
    nav: {
      url: getUrlWithLocale('/docs', locale),
      title: (
        <>
          <Logo className="size-6" />
          {t('title')}
        </>
      ),
    },
    links: [
      {
        text: t('homepage'),
        url: getUrlWithLocale('/', locale),
        icon: <HomeIcon />,
        active: 'none',
        external: false,
      },
      ...(websiteConfig.metadata.social?.twitter
        ? [
            {
              type: 'icon' as const,
              icon: <XTwitterIcon />,
              text: 'X',
              url: websiteConfig.metadata.social.twitter,
              secondary: true,
            },
          ]
        : []),
    ],
    themeSwitch: {
      enabled: true,
      mode: 'light-dark-system',
      component: <ModeSwitcher />,
    },
  };

  return (
    <DocsLayout tree={source.pageTree[locale]} {...docsOptions}>
      {children}
    </DocsLayout>
  );
}
