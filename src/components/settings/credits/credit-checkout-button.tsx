'use client';

import { createCreditCheckoutSession } from '@/actions/create-credit-checkout-session';
import { Button } from '@/components/ui/button';
import { websiteConfig } from '@/config/website';
import { Loader2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

interface CreditCheckoutButtonProps {
  userId: string;
  packageId: string;
  priceId: string;
  metadata?: Record<string, string>;
  variant?:
    | 'default'
    | 'outline'
    | 'destructive'
    | 'secondary'
    | 'ghost'
    | 'link'
    | null;
  size?: 'default' | 'sm' | 'lg' | 'icon' | null;
  className?: string;
  children?: React.ReactNode;
  disabled?: boolean;
}

/**
 * Credit Checkout Button
 *
 * This client component creates a Stripe checkout session for credit purchases
 * and redirects to it. It's used to initiate the credit purchase process.
 *
 * NOTICE: Login is required when using this button.
 */
export function CreditCheckoutButton({
  userId,
  packageId,
  priceId,
  metadata,
  variant = 'default',
  size = 'default',
  className,
  children,
  disabled = false,
}: CreditCheckoutButtonProps) {
  const t = useTranslations('Dashboard.settings.credits.packages');
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    try {
      setIsLoading(true);

      const mergedMetadata = metadata ? { ...metadata } : {};

      // add promotekit_referral to metadata if enabled promotekit affiliate
      if (websiteConfig.features.enablePromotekitAffiliate) {
        const promotekitReferral =
          typeof window !== 'undefined'
            ? (window as any).promotekit_referral
            : undefined;
        if (promotekitReferral) {
          console.log(
            'create credit checkout button, promotekitReferral:',
            promotekitReferral
          );
          mergedMetadata.promotekit_referral = promotekitReferral;
        }
      }

      // add affonso_referral to metadata if enabled affonso affiliate
      if (websiteConfig.features.enableAffonsoAffiliate) {
        const affonsoReferral =
          typeof document !== 'undefined'
            ? (() => {
                const match = document.cookie.match(
                  /(?:^|; )affonso_referral=([^;]*)/
                );
                return match ? decodeURIComponent(match[1]) : null;
              })()
            : null;
        if (affonsoReferral) {
          console.log(
            'create credit checkout button, affonsoReferral:',
            affonsoReferral
          );
          mergedMetadata.affonso_referral = affonsoReferral;
        }
      }

      // Create checkout session using server action
      const result = await createCreditCheckoutSession({
        userId,
        packageId,
        priceId,
        metadata:
          Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined,
      });

      // Redirect to checkout page
      if (result?.data?.success && result.data.data?.url) {
        window.location.href = result.data.data?.url;
      } else {
        console.error('Create credit checkout session error, result:', result);
        toast.error(t('checkoutFailed'));
      }
    } catch (error) {
      console.error('Create credit checkout session error:', error);
      toast.error(t('checkoutFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleClick}
      disabled={isLoading || disabled}
    >
      {isLoading ? (
        <>
          <Loader2Icon className="mr-2 size-4 animate-spin" />
          {t('loading')}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
