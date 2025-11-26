import { redirect } from 'next/navigation';
import CreditsPageClient from '@/components/settings/credits/credits-page-client';
import { isCreditsEnabled } from '@/lib/credits-settings';
import { Routes } from '@/routes';

/**
 * Credits page, show credit balance and transactions
 */
export default function CreditsPage() {
  // If credits are disabled, redirect to billing page
  if (!isCreditsEnabled()) {
    redirect(Routes.SettingsBilling);
  }

  return <CreditsPageClient />;
}
