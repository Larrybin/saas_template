import { describe, expect, it, vi } from 'vitest';

import { DomainError } from '../domain-errors';

type SafeActionConfig = {
  handleServerError: (e: unknown) => unknown;
};

type HandleRef = {
  handler?: (e: unknown) => unknown;
};

const { handleRef } = vi.hoisted(() => ({
  handleRef: {} as HandleRef,
}));

vi.mock('next-safe-action', () => ({
  createSafeActionClient: (config: SafeActionConfig) => {
    handleRef.handler = config.handleServerError;
    return {
      use: vi.fn(() => ({ use: vi.fn() })),
    };
  },
}));

// Import module under test after mocks are in place
// eslint-disable-next-line import/no-unassigned-import
import '../safe-action';

describe('safe-action handleServerError', () => {
  it('maps DomainError to envelope with code and retryable', () => {
    expect(handleRef.handler).toBeTypeOf('function');
    const handleServerError = handleRef.handler as (e: unknown) => unknown;

    const error = new DomainError({
      code: 'TEST_CODE' as never,
      message: 'test message',
      retryable: true,
    });

    const result = handleServerError(error) as {
      success: boolean;
      error: string;
      code: string;
      retryable: boolean;
    };

    expect(result).toEqual({
      success: false,
      error: 'test message',
      code: 'TEST_CODE',
      retryable: true,
    });
  });

  it('maps generic Error to envelope without code', () => {
    expect(handleRef.handler).toBeTypeOf('function');
    const handleServerError = handleRef.handler as (e: unknown) => unknown;

    const error = new Error('boom');

    const result = handleServerError(error) as {
      success: boolean;
      error: string;
      code?: string;
      retryable?: boolean;
    };

    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
    expect(result.code).toBeUndefined();
    expect(result.retryable).toBeUndefined();
  });

  it('maps unknown error value to generic envelope', () => {
    expect(handleRef.handler).toBeTypeOf('function');
    const handleServerError = handleRef.handler as (e: unknown) => unknown;

    const result = handleServerError(42) as {
      success: boolean;
      error: string;
    };

    expect(result).toEqual({
      success: false,
      error: 'Something went wrong while executing the action',
    });
  });
});
