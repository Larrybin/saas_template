'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { getErrorUiStrategy } from '@/lib/domain-error-ui-registry';
import type { DomainErrorLike } from '@/lib/domain-error-utils';
import { getDomainErrorMessage } from '@/lib/domain-error-utils';

type StorageErrorInput =
  | (Error & DomainErrorLike)
  | DomainErrorLike
  | { code?: string; message?: string }
  | null
  | undefined;

/**
 * useStorageErrorUi
 *
 * 统一处理 Storage 相关错误的基础 UI 行为：
 * - 根据 code 查找 UI 策略（域：storage）；
 * - 使用 getDomainErrorMessage + fallback 生成提示文案；
 * - 通过 toast 输出错误信息；
 * - 返回最终 message，方便调用方写入本地 state。
 */
export function useStorageErrorUi() {
  const handleStorageError = useCallback(
    (error: StorageErrorInput, fallbackMessage?: string): string => {
      if (!error) {
        const msg =
          fallbackMessage ?? 'Failed to upload file. Please try again later.';
        toast.error(msg);
        return msg;
      }

      const code =
        typeof (error as DomainErrorLike)?.code === 'string'
          ? (error as DomainErrorLike).code
          : undefined;
      const rawMessage =
        error instanceof Error && typeof error.message === 'string'
          ? error.message
          : (error as { message?: string })?.message;

      const strategy = getErrorUiStrategy(code);
      const fallback =
        fallbackMessage ??
        rawMessage ??
        strategy?.defaultFallbackMessage ??
        'Failed to upload file. Please try again later.';

      const message = getDomainErrorMessage(code, undefined, fallback);

      // Storage 错误统一用 error toast，避免在多个组件里散落逻辑
      toast.error(message);

      return message;
    },
    []
  );

  return {
    handleStorageError,
  };
}
