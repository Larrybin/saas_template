import { defineI18nUI } from 'fumadocs-ui/i18n';
import { docsI18nConfig } from './i18n';

const { provider } = defineI18nUI(docsI18nConfig, {
  translations: {
    en: {
      displayName: 'English',
    },
    zh: {
      displayName: '中文',
    },
  },
});

export function getDocsUiI18n(locale: string) {
  return provider(locale);
}
