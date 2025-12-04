import { describe, expect, it } from 'vitest';
import { websiteConfig } from '@/config/website';
import { mailConfigProvider } from '@/mail/mail-config-provider';

describe('MailConfigProvider', () => {
  it('returns websiteConfig.mail as is', () => {
    const original = websiteConfig.mail;

    const result = mailConfigProvider.getMailConfig();

    expect(result).toBe(original);
  });
});
