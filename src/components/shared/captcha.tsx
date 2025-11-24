'use client';

import dynamic from 'next/dynamic';
import { useLocale } from 'next-intl';
import { useTheme } from 'next-themes';
import { type ComponentProps, forwardRef } from 'react';
import { FormMessage } from '@/components/ui/form';
import { websiteConfig } from '@/config/website';
import { clientEnv } from '@/env/client';
import { clientLogger } from '@/lib/client-logger';

const Turnstile = dynamic(
  () => import('@marsidev/react-turnstile').then((mod) => mod.Turnstile),
  {
    ssr: false,
  }
);

export type CaptchaRef =
  | ({
      reset?: () => void;
    } & {
      // underlying instance shape is not exposed in types; keep it opaque
      // but allow compatibility with TurnstileInstance | null | undefined
    })
  | null
  | undefined;

type Props = Omit<ComponentProps<typeof Turnstile>, 'siteKey'> & {
  validationError?: string | undefined;
};

/**
 * Captcha component for Cloudflare Turnstile
 */
type CaptchaInnerProps = Props & {
  siteKey: string;
};

const CaptchaInner = forwardRef<CaptchaRef, CaptchaInnerProps>(
  ({ validationError, siteKey, ...props }, ref) => {
    const theme = useTheme();
    const locale = useLocale();

    return (
      <>
        <Turnstile
          // biome-ignore lint/suspicious/noExplicitAny: align ref types with underlying Turnstile instance
          ref={ref as any}
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

CaptchaInner.displayName = 'CaptchaInner';

export const Captcha = forwardRef<CaptchaRef, Props>(
  ({ validationError, ...props }, ref) => {
    const turnstileEnabled = websiteConfig.features.enableTurnstileCaptcha;
    const siteKey = clientEnv.turnstileSiteKey;

    // If turnstile is disabled in config, don't render anything
    if (!turnstileEnabled) {
      return null;
    }

    // If turnstile is enabled but site key is missing, show error message
    if (!siteKey) {
      clientLogger.error('Captcha: NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set');
      return null;
    }

    return (
      <CaptchaInner
        {...props}
        validationError={validationError}
        siteKey={siteKey}
        ref={ref}
      />
    );
  }
);

Captcha.displayName = 'Captcha';
