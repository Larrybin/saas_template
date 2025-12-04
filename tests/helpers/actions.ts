import { vi } from 'vitest';

// Shared mocks for Server Actions tests (safe-action + logger)

export const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => loggerMock,
}));

function createSafeActionClientMock() {
  const identity = (impl: unknown) => impl;

  return {
    // Support both `client.action(impl)` and `client.schema().action(impl)`
    action: identity,
    schema: () => ({
      action: identity,
    }),
  };
}

export const actionClientMock = createSafeActionClientMock();
export const userActionClientMock = createSafeActionClientMock();
export const adminActionClientMock = createSafeActionClientMock();

vi.mock('@/lib/safe-action', async () => {
  const actual = await vi.importActual<typeof import('@/lib/safe-action')>(
    '@/lib/safe-action'
  );

  return {
    ...actual,
    actionClient: actionClientMock,
    userActionClient: userActionClientMock,
    adminActionClient: adminActionClientMock,
  };
});
