'use client';

import Script from 'next/script';
import { clientEnv } from '@/env/client';

/**
 * Plausible Analytics
 *
 * NOTICE:
 * If you do not check `404 error pages` when you set up Plausible Analytics,
 * you do not need to add new script to this component.
 *
 * https://plausible.io
 * https://mksaas.com/docs/analytics#plausible
 */
export function PlausibleAnalytics() {
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  const domain = clientEnv.analytics.plausible.domain;
  if (!domain) {
    return null;
  }

  const script = clientEnv.analytics.plausible.scriptUrl;
  if (!script) {
    return null;
  }

  return (
    <Script defer type="text/javascript" data-domain={domain} src={script} />
  );
}
