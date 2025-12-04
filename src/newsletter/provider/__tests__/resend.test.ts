import { describe, expect, it } from 'vitest';
import { createNewsletterLogFields } from '../resend';

describe('ResendNewsletterProvider', () => {
  it('buildEmailLogFields returns hashed email data with audience info', () => {
    const fields = createNewsletterLogFields(
      'user@example.com',
      'audience-123',
      { extra: 'value' }
    );

    expect(fields).toMatchObject({
      emailDomain: 'example.com',
      audienceId: 'audience-123',
      extra: 'value',
    });
    expect(fields.emailHash).toHaveLength(12);
  });
});
