import { defineI18nUI } from 'fumadocs-ui/i18n';
import { websiteConfig } from '@/config/website';
import { LOCALES } from '@/i18n/routing';
import { docsI18nConfig } from './i18n';

export type DocsLocale = (typeof LOCALES)[number];

const translations = Object.fromEntries(
  LOCALES.map((locale) => {
    const config = websiteConfig.i18n.locales[locale];
    return [
      locale,
      {
        displayName: config?.name ?? locale,
      },
    ];
  })
) as Record<DocsLocale, { displayName: string }>;

const { provider } = defineI18nUI(docsI18nConfig, {
  translations,
});

export function getDocsUiI18n(locale: DocsLocale) {
  return provider(locale);
}
