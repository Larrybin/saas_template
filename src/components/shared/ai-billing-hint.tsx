'use client';

import { InfoIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type AiBillingHintVariant = 'chat' | 'text' | 'image';

export type AiBillingHintProps = {
  variant: AiBillingHintVariant;
  className?: string;
  extraContent?: ReactNode;
};

const VARIANT_KEY_MAP: Record<AiBillingHintVariant, string> = {
  chat: 'chatHint',
  text: 'textHint',
  image: 'imageHint',
};

export function AiBillingHint(props: AiBillingHintProps) {
  const { variant, className, extraContent } = props;

  const t = useTranslations('AIBilling');
  const hintKey = VARIANT_KEY_MAP[variant];

  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-3xl items-start gap-3 rounded-md border border-dashed border-primary/20 bg-primary/5 px-3 py-2 text-left text-xs text-muted-foreground sm:px-4 sm:py-3 sm:text-sm',
        className
      )}
    >
      <span className="mt-0.5 flex size-4 items-center justify-center rounded-full bg-primary/10 text-primary sm:mt-1 sm:size-5">
        <InfoIcon className="size-3 sm:size-4" aria-hidden="true" />
      </span>
      <div className="flex-1 space-y-1">
        <p>{t(hintKey as Parameters<typeof t>[0])}</p>
        {extraContent ? (
          <div className="text-xs text-muted-foreground/80">{extraContent}</div>
        ) : null}
      </div>
    </div>
  );
}
