'use client';

import Script from 'next/script';
import { clientEnv } from '@/env/client';

/**
 * DataFast Analytics
 *
 * https://datafa.st
 * https://mksaas.com/docs/analytics#datafast
 */
export default function DataFastAnalytics() {
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  const domain = clientEnv.analytics.dataFast.domain;
  if (!domain) {
    return null;
  }

  const websiteId = clientEnv.analytics.dataFast.websiteId;
  if (!websiteId) {
    return null;
  }

  return (
    <>
      <Script
        defer
        data-website-id={websiteId}
        data-domain={domain}
        src="https://datafa.st/js/script.js"
      />
    </>
  );
}
