import { describe, expect, it } from 'vitest';

import { truncateContent } from '../scraper';

describe('scraper utilities', () => {
  it('truncates content by words and sentences', () => {
    const content =
      'Sentence one. Sentence two is quite a bit longer and should be truncated once the limit is met. Final sentence.';
    const result = truncateContent(content, 40);
    expect(result).toMatch(/Sentence one/);
    expect(result.endsWith('...') || result.endsWith('.')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(80);
  });
});
