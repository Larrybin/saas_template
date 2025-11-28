import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DOMAIN_ERROR_MESSAGES } from '../src/lib/domain-error-utils';

type MessagesObject = Record<string, unknown>;

function loadMessages(locale: string): MessagesObject {
  const filePath = path.resolve('messages', `${locale}.json`);
  const raw = readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as MessagesObject;
}

function getByKeyPath(source: MessagesObject, keyPath: string): unknown {
  const segments = keyPath.split('.');
  let current: unknown = source;

  for (const segment of segments) {
    if (
      current &&
      typeof current === 'object' &&
      Object.hasOwn(current, segment)
    ) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }

  return current;
}

async function main() {
  const locales = ['en', 'zh'] as const;
  const messagesByLocale: Record<(typeof locales)[number], MessagesObject> = {
    en: loadMessages('en'),
    zh: loadMessages('zh'),
  };

  const missing: Array<{
    code: string;
    key: string;
    locales: string[];
  }> = [];

  for (const [code, definition] of Object.entries(DOMAIN_ERROR_MESSAGES)) {
    const key = definition.key;
    const missingLocales = locales.filter((locale) => {
      const messages = messagesByLocale[locale];
      const value = getByKeyPath(messages, key);
      return typeof value !== 'string';
    });

    if (missingLocales.length > 0) {
      missing.push({
        code,
        key,
        locales: missingLocales,
      });
    }
  }

  if (missing.length > 0) {
    console.error(
      'Detected missing i18n entries for DOMAIN_ERROR_MESSAGES keys:'
    );
    for (const item of missing) {
      console.error(
        `- code=${item.code}, key=${item.key}, missing locales=[${item.locales.join(
          ', '
        )}]`
      );
    }
    process.exit(1);
  } else {
    console.log(
      'All DOMAIN_ERROR_MESSAGES keys are present in messages/en.json and messages/zh.json.'
    );
  }
}

main().catch((error) => {
  console.error('Failed to run domain error i18n check:', error);
  process.exit(1);
});
