'use client';

import Script from 'next/script';
import { websiteConfig } from '@/config/website';

/**
 * PromoteKit
 *
 * https://www.promotekit.com
 */
export default function PromotekitScript() {
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  if (!websiteConfig.features.enablePromotekitAffiliate) {
    return null;
  }

  const promotekitKey = process.env.NEXT_PUBLIC_AFFILIATE_PROMOTEKIT_ID;
  if (!promotekitKey) {
    return null;
  }

  return (
    <>
      <Script
        src="https://cdn.promotekit.com/promotekit.js"
        data-promotekit={promotekitKey}
        strategy="afterInteractive"
      />
    </>
  );
}
