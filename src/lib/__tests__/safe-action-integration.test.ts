import { describe, expect, it } from 'vitest';

import { DomainError } from '../domain-errors';
import { actionClient } from '../safe-action';

describe('actionClient + next-safe-action integration', () => {
  it('uses handleServerError result when DomainError is thrown', async () => {
    const action = actionClient.action(async () => {
      throw new DomainError({
        // 这里只关心 handleServerError 的 envelope 映射，不依赖具体 ErrorCode 枚举
        code: 'TEST_CODE' as never,
        message: 'test message',
        retryable: true,
      });
    });

    const result = await action(undefined as never);

    // next-safe-action 会将 handleServerError 的返回值挂在 serverError 字段上
    expect(result).toHaveProperty('serverError');
    expect(result.serverError).toEqual({
      success: false,
      error: 'test message',
      code: 'TEST_CODE',
      retryable: true,
    });
  });

  it('uses handleServerError result when generic Error is thrown', async () => {
    const action = actionClient.action(async () => {
      throw new Error('boom');
    });

    const result = await action(undefined as never);

    expect(result).toHaveProperty('serverError');
    expect(result.serverError).toEqual({
      success: false,
      error: 'boom',
    });
  });
});
