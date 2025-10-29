'use client';

import { CreditPackages } from '@/components/settings/credits/credit-packages';
import { CreditTransactions } from '@/components/settings/credits/credit-transactions';
import CreditsBalanceCard from '@/components/settings/credits/credits-balance-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslations } from 'next-intl';
import { parseAsStringLiteral, useQueryState } from 'nuqs';

/**
 * Credits page client, show credit balance and transactions
 */
export default function CreditsPageClient() {
  const t = useTranslations('Dashboard.settings.credits');

  const [activeTab, setActiveTab] = useQueryState(
    'tab',
    parseAsStringLiteral(['balance', 'transactions']).withDefault('balance')
  );

  const handleTabChange = (value: string) => {
    if (value === 'balance' || value === 'transactions') {
      setActiveTab(value);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        <TabsList className="">
          <TabsTrigger value="balance">{t('tabs.balance')}</TabsTrigger>
          <TabsTrigger value="transactions">
            {t('tabs.transactions')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="balance" className="mt-4 flex flex-col gap-8">
          {/* Credits Balance Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <CreditsBalanceCard />
          </div>

          {/* Credit Packages */}
          <div className="w-full">
            <CreditPackages />
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          {/* Credit Transactions */}
          <CreditTransactions />
        </TabsContent>
      </Tabs>
    </div>
  );
}
