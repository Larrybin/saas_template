'use client';

import { websiteConfig } from '@/config/website';
import { useCreditBalance } from '@/hooks/use-credits';
import { useLocaleRouter } from '@/i18n/navigation';
import { Routes } from '@/routes';
import { CoinsIcon, Loader2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function CreditsBalanceMenu() {
  // If credits are not enabled, return null
  if (!websiteConfig.credits.enableCredits) {
    return null;
  }

  const t = useTranslations('Marketing.avatar');
  const router = useLocaleRouter();

  // Use TanStack Query hook for credit balance
  const { data: balance = 0, isLoading } = useCreditBalance();

  const handleClick = () => {
    router.push(Routes.SettingsCredits);
  };

  return (
    <div
      className="flex items-center justify-between cursor-pointer w-full"
      onClick={handleClick}
    >
      <div className="flex items-center space-x-2.5">
        <CoinsIcon className="h-4 w-4" />
        <p className="text-sm">{t('credits')}</p>
      </div>
      <div className="flex items-center">
        <p className="text-sm font-medium">
          {isLoading ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            balance.toLocaleString()
          )}
        </p>
      </div>
    </div>
  );
}
