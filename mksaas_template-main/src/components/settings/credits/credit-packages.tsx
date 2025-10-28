'use client';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getCreditPackages } from '@/config/credits-config';
import { websiteConfig } from '@/config/website';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useCurrentPlan } from '@/hooks/use-payment';
import { authClient } from '@/lib/auth-client';
import { formatPrice } from '@/lib/formatter';
import { cn } from '@/lib/utils';
import { CircleCheckBigIcon, CoinsIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CreditCheckoutButton } from './credit-checkout-button';

/**
 * Credit packages component
 */
export function CreditPackages() {
  // Check if credits are enabled - move this check before any hooks
  if (!websiteConfig.credits.enableCredits) {
    return null;
  }

  const t = useTranslations('Dashboard.settings.credits.packages');

  // Get current user and payment info
  const currentUser = useCurrentUser();
  const { data: session } = authClient.useSession();
  const { data: paymentData } = useCurrentPlan(session?.user?.id);
  const currentPlan = paymentData?.currentPlan;

  // Get credit packages with translations - must be called here to maintain hook order
  const creditPackages = Object.values(getCreditPackages()).filter(
    (pkg) => !pkg.disabled && pkg.price.priceId
  );

  // Check if user is on free plan and enablePackagesForFreePlan is false
  const isFreePlan = currentPlan?.isFree === true;

  // Check if user is on free plan and enablePackagesForFreePlan is false
  if (isFreePlan && !websiteConfig.credits.enablePackagesForFreePlan) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{t('title')}</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          {t('description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {creditPackages.map((creditPackage) => (
            <Card
              key={creditPackage.id}
              className={cn(
                `relative ${creditPackage.popular ? 'border-primary' : ''}`,
                'shadow-none border-1 border-border'
              )}
            >
              {creditPackage.popular && (
                <div className="absolute -top-3.5 left-1/2 transform -translate-x-1/2">
                  <Badge
                    variant="default"
                    className="bg-primary text-primary-foreground"
                  >
                    {t('popular')}
                  </Badge>
                </div>
              )}

              <CardContent className="space-y-4">
                {/* Price and Credits - Left/Right Layout */}
                <div className="flex items-center justify-between py-2">
                  <div className="text-left">
                    <div className="text-2xl font-semibold flex items-center gap-2">
                      <CoinsIcon className="h-4 w-4 text-muted-foreground" />
                      {creditPackage.amount.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-primary">
                      {formatPrice(
                        creditPackage.price.amount,
                        creditPackage.price.currency
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground text-left py-2 flex items-center gap-2">
                  <CircleCheckBigIcon className="h-4 w-4 text-green-500" />
                  {creditPackage.description}
                </div>

                {/* purchase button using checkout */}
                <CreditCheckoutButton
                  userId={currentUser?.id ?? ''}
                  packageId={creditPackage.id}
                  priceId={creditPackage.price.priceId}
                  className="w-full cursor-pointer mt-2"
                  variant={creditPackage.popular ? 'default' : 'outline'}
                  disabled={!creditPackage.price.priceId}
                >
                  {t('purchase')}
                </CreditCheckoutButton>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
