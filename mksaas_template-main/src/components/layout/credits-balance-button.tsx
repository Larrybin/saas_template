'use client';

import { Button } from '@/components/ui/button';
import { websiteConfig } from '@/config/website';
import { useCreditBalance } from '@/hooks/use-credits';
import { useLocaleRouter } from '@/i18n/navigation';
import { Routes } from '@/routes';
import { CoinsIcon, Loader2Icon } from 'lucide-react';

export function CreditsBalanceButton() {
  // If credits are not enabled, return null
  if (!websiteConfig.credits.enableCredits) {
    return null;
  }

  const router = useLocaleRouter();

  // Use TanStack Query hook for credit balance
  const { data: balance = 0, isLoading } = useCreditBalance();

  const handleClick = () => {
    router.push(Routes.SettingsCredits);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-2 px-2 text-sm font-medium cursor-pointer"
      onClick={handleClick}
    >
      <CoinsIcon className="h-4 w-4" />
      <span className="">
        {isLoading ? (
          <Loader2Icon className="h-4 w-4 animate-spin" />
        ) : (
          balance.toLocaleString()
        )}
      </span>
    </Button>
  );
}
