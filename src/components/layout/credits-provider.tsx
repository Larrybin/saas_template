'use client';

import { websiteConfig } from '@/config/website';

/**
 * Credits Provider Component
 *
 * This component is now simplified since TanStack Query handles data fetching automatically.
 * It's kept for potential future credits-related providers.
 * Only renders when credits are enabled in the website configuration.
 */
export function CreditsProvider({ children }: { children: React.ReactNode }) {
  // Only render when credits are enabled
  if (!websiteConfig.credits.enableCredits) {
    return <>{children}</>;
  }

  return <>{children}</>;
}
