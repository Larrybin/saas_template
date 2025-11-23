'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { toast } from 'sonner';
import {
  handleAuthFromEnvelope,
  useAuthErrorHandler,
} from '@/hooks/use-auth-error-handler';
import { useLocaleRouter } from '@/i18n/navigation';
import {
  type DomainErrorLike,
  getDomainErrorMessage,
} from '@/lib/domain-error-utils';
import { Routes } from '@/routes';

type CreditsErrorInput =
  | (Error & DomainErrorLike)
  | DomainErrorLike
  | { code?: string; error?: string }
  | null
  | undefined;

/**
 * useCreditsErrorUi
 *
 * 封装 Credits 相关错误的标准 UI 行为：
 * - AUTH_UNAUTHORIZED → 复用 useAuthErrorHandler（toast + 跳转登录）
 * - CREDITS_INSUFFICIENT_BALANCE → toast + 跳转 Credits 设置页
 * - 其他错误 → 使用 DomainError i18n 映射或 fallback 文案做 toast
 */
export function useCreditsErrorUi() {
  const t = useTranslations();
  const translate = useCallback(
    (key: string) => t(key as Parameters<typeof t>[0]),
    [t]
  );
  const router = useLocaleRouter();
  const handleAuthError = useAuthErrorHandler();

  const handleError = useCallback(
    (error: CreditsErrorInput) => {
      if (!error) return;

      const code =
        typeof (error as DomainErrorLike)?.code === 'string'
          ? (error as DomainErrorLike).code
          : undefined;
      const message =
        error instanceof Error && typeof error.message === 'string'
          ? error.message
          : (error as { error?: string })?.error;

      // 统一处理未登录错误
      if (code === 'AUTH_UNAUTHORIZED') {
        handleAuthFromEnvelope(handleAuthError, {
          code,
          error: message,
        });
        return;
      }

      // 积分不足：toast + 跳转 Credits 页面
      if (code === 'CREDITS_INSUFFICIENT_BALANCE') {
        const resolved = getDomainErrorMessage(
          code,
          translate,
          translate('Dashboard.settings.credits.balance.insufficientCredits')
        );
        toast.error(resolved);
        router.push(Routes.SettingsCredits);
        return;
      }

      const fallback = message ?? 'Failed to process credits request';
      const resolved = getDomainErrorMessage(code, translate, fallback);
      toast.error(resolved);
    },
    [handleAuthError, router, translate]
  );

  return {
    handleCreditsError: handleError,
  };
}
