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

const HANDLED_AUTH_CODES = new Set(['AUTH_UNAUTHORIZED', 'AUTH_BANNED']);

type AuthErrorHandlerOptions = {
  callbackUrl?: string;
};

function resolveCallbackUrl(explicit?: string): string | undefined {
  if (explicit?.startsWith('/')) {
    return explicit;
  }

  if (typeof window === 'undefined') {
    return undefined;
  }

  const pathname = window.location.pathname || '/';
  const search = window.location.search || '';
  const combined = `${pathname}${search}`;

  return combined.startsWith('/') ? combined : '/';
}

export function useAuthErrorHandler() {
  const t = useTranslations();
  const router = useLocaleRouter();

  return (
    error: AuthErrorInput | null | undefined,
    options?: AuthErrorHandlerOptions
  ): boolean => {
    if (!error?.code) {
      return false;
    }

    if (!HANDLED_AUTH_CODES.has(error.code)) {
      return false;
    }

    const message = getDomainErrorMessage(
      error.code,
      (key) => t(key as Parameters<typeof t>[0]),
      error.message ?? 'Unauthorized'
    );

    toast.error(message);

    const callbackUrl = resolveCallbackUrl(options?.callbackUrl);

    if (callbackUrl) {
      router.push(
        `${Routes.Login}?callbackUrl=${encodeURIComponent(callbackUrl)}`
      );
    } else {
      router.push(Routes.Login);
    }

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

  if (!HANDLED_AUTH_CODES.has(payload.code)) {
    return;
  }

  handleAuthError({ code: payload.code, message: payload.error });
}
