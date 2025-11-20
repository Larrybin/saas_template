'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { toast } from 'sonner';
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

      const message = getDomainErrorMessage(code, translate, fallback);

      const toastOptions = {
        description: message,
      };

      // 粗粒度区分错误级别，优先覆盖常见 AI 场景
      if (
        code === 'AI_CONTENT_TIMEOUT' ||
        code === 'AI_IMAGE_TIMEOUT' ||
        code === 'AI_CONTENT_RATE_LIMIT'
      ) {
        toast.warning('AI request delayed', toastOptions);
        return;
      }

      if (
        code === 'AI_CONTENT_SERVICE_UNAVAILABLE' ||
        code === 'AI_IMAGE_PROVIDER_ERROR' ||
        code === 'AI_CONTENT_NETWORK_ERROR'
      ) {
        toast.error('AI service unavailable', toastOptions);
        return;
      }

      if (
        code === 'AI_CONTENT_VALIDATION_ERROR' ||
        code === 'AI_IMAGE_INVALID_PARAMS' ||
        code === 'AI_IMAGE_INVALID_JSON'
      ) {
        toast.info('Invalid AI request', toastOptions);
        return;
      }

      // 默认降级为 error
      toast.error(
        context.source === 'image'
          ? 'Image generation failed'
          : 'AI request failed',
        toastOptions
      );
    },
    [translate]
  );

  return {
    handleAiError,
  };
}
