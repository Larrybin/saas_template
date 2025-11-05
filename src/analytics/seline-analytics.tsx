'use client';

import Script from 'next/script';
import { clientEnv } from '@/env';

/**
 * Seline Analytics
 *
 * https://seline.com
 * https://mksaas.com/docs/analytics#seline
 * https://seline.com/docs/install-seline
 * https://seline.com/docs/stripe
 */
export function SelineAnalytics() {
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  const token = clientEnv.analytics.selineToken;
  if (!token) {
    return null;
  }

  return (
    <Script async src="https://cdn.seline.com/seline.js" data-token={token} />
  );
}
