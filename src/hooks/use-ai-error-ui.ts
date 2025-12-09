'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { getErrorUiStrategy } from '@/lib/domain-error-ui-registry';
import type { DomainErrorLike } from '@/lib/domain-error-utils';
import { getDomainErrorMessage } from '@/lib/domain-error-utils';

type AiErrorInput =
  | (Error & DomainErrorLike)
  | ({ message?: string } & DomainErrorLike)
  | null
  | undefined;

type AiErrorContext = {
  source?: 'text' | 'image' | 'unknown';
};

/**
 * useAiErrorUi
 *
 * 统一处理 AI 相关错误（文本分析 / 图片生成）的基础 UI 行为：
 * - 根据 code 映射 i18n 文案；
 * - 根据错误类型选择 toast 严重级别；
 * - 避免在多个组件里散落 `if (code === ...)` 判断。
 *
 * 目前只在图片生成 hook 中接入，文本分析可在未来视情况切换。
 */
export function useAiErrorUi() {
  const t = useTranslations();
  const aiErrorsT = useTranslations('AIErrors');
  const translate = useCallback(
    (key: string) => t(key as Parameters<typeof t>[0]),
    [t]
  );

  const handleAiError = useCallback(
    (error: AiErrorInput, context: AiErrorContext = {}) => {
      if (!error) return;

      const code =
        typeof (error as DomainErrorLike)?.code === 'string'
          ? (error as DomainErrorLike).code
          : undefined;
      const rawMessage =
        error instanceof Error && error.message
          ? error.message
          : (error as { message?: string })?.message;

      const fallback =
        rawMessage ?? 'Failed to process AI request. Please try again later.';

      const strategy = getErrorUiStrategy(code);
      const message = getDomainErrorMessage(
        code,
        translate,
        strategy?.defaultFallbackMessage ?? fallback
      );
      const toastOptions = { description: message };

      const severity = strategy?.severity;

      if (severity === 'info') {
        toast.info(aiErrorsT('invalidRequestTitle'), toastOptions);
        return;
      }

      if (severity === 'warning') {
        toast.warning(aiErrorsT('delayedTitle'), toastOptions);
        return;
      }

      const title =
        context.source === 'image'
          ? aiErrorsT('imageFailedTitle')
          : aiErrorsT('requestFailedTitle');

      if (severity === 'error') {
        toast.error(title, toastOptions);
        return;
      }

      // 没有命中策略时降级为 error，但仍使用统一的 i18n 标题
      toast.error(
        context.source === 'image'
          ? aiErrorsT('imageFailedTitle')
          : aiErrorsT('requestFailedTitle'),
        toastOptions
      );
    },
    [aiErrorsT, translate]
  );

  return {
    handleAiError,
  };
}
