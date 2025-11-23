'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useLocaleRouter } from '@/i18n/navigation';
import type { DomainErrorLike } from '@/lib/domain-error-utils';
import { getDomainErrorMessage } from '@/lib/domain-error-utils';
import { Routes } from '@/routes';

export type AuthErrorInput = DomainErrorLike & {
  message?: string | undefined;
};

export function useAuthErrorHandler() {
  const t = useTranslations();
  const router = useLocaleRouter();

  return (error: AuthErrorInput | null | undefined): boolean => {
    if (!error?.code) {
      return false;
    }

    if (error.code !== 'AUTH_UNAUTHORIZED') {
      return false;
    }

    const message = getDomainErrorMessage(
      error.code,
      (key) => t(key as Parameters<typeof t>[0]),
      error.message ?? 'Unauthorized'
    );

    toast.error(message);
    router.push(Routes.Login);

    return true;
  };
}

export function handleAuthFromEnvelope(
  handleAuthError: (error: AuthErrorInput | null | undefined) => boolean,
  payload:
    | { code?: string | undefined; error?: string | undefined }
    | null
    | undefined
): void {
  if (!payload?.code) {
    return;
  }

  if (payload.code === 'AUTH_UNAUTHORIZED') {
    handleAuthError({ code: payload.code, message: payload.error });
  }
}
