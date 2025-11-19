'use client';

import Script from 'next/script';
import { clientEnv } from '@/env/client';

/**
 * Umami Analytics
 *
 * https://umami.is
 * https://mksaas.com/docs/analytics#umami
 */
export function UmamiAnalytics() {
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  const websiteId = clientEnv.analytics.umami.websiteId;
  if (!websiteId) {
    return null;
  }

  const script = clientEnv.analytics.umami.scriptUrl;
  if (!script) {
    return null;
  }

  return (
    <Script
      async
      type="text/javascript"
      data-website-id={websiteId}
      src={script}
    />
  );
}
