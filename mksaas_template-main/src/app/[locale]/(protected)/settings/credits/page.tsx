import CreditsPageClient from '@/components/settings/credits/credits-page-client';
import { websiteConfig } from '@/config/website';
import { Routes } from '@/routes';
import { redirect } from 'next/navigation';

/**
 * Credits page, show credit balance and transactions
 */
export default function CreditsPage() {
  // If credits are disabled, redirect to billing page
  if (!websiteConfig.credits.enableCredits) {
    redirect(Routes.SettingsBilling);
  }

  return <CreditsPageClient />;
}
