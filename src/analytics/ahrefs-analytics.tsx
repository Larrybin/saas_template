'use client';

import Script from 'next/script';
import { clientEnv } from '@/env/client';

/**
 * Ahrefs Analytics
 *
 * https://ahrefs.com/
 * https://mksaas.com/docs/analytics#ahrefs
 */
export function AhrefsAnalytics() {
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  const websiteId = clientEnv.analytics.ahrefsWebsiteId;
  if (!websiteId) {
    return null;
  }

  return (
    <Script
      async
      type="text/javascript"
      data-key={websiteId}
      src="https://analytics.ahrefs.com/analytics.js"
    />
  );
}
