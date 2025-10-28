'use client';

import { FormMessage } from '@/components/ui/form';
import { websiteConfig } from '@/config/website';
import { useLocale } from 'next-intl';
import { useTheme } from 'next-themes';
import dynamic from 'next/dynamic';
import { type ComponentProps, forwardRef } from 'react';

const Turnstile = dynamic(
  () => import('@marsidev/react-turnstile').then((mod) => mod.Turnstile),
  {
    ssr: false,
  }
);

type Props = Omit<ComponentProps<typeof Turnstile>, 'siteKey'> & {
  validationError?: string;
};

/**
 * Captcha component for Cloudflare Turnstile
 */
export const Captcha = forwardRef<any, Props>(
  ({ validationError, ...props }, ref) => {
    const turnstileEnabled = websiteConfig.features.enableTurnstileCaptcha;
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

    // If turnstile is disabled in config, don't render anything
    if (!turnstileEnabled) {
      return null;
    }

    // If turnstile is enabled but site key is missing, show error message
    if (!siteKey) {
      console.error('Captcha: NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set');
      return null;
    }

    const theme = useTheme();
    const locale = useLocale();

    return (
      <>
        <Turnstile
          ref={ref}
          options={{
            size: 'flexible',
            language: locale,
            theme: theme.theme === 'dark' ? 'dark' : 'light',
          }}
          {...props}
          siteKey={siteKey}
        />

        {validationError && (
          <FormMessage className="text-red-500 mt-2">
            {validationError}
          </FormMessage>
        )}
      </>
    );
  }
);

Captcha.displayName = 'Captcha';
