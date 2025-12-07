import { vi } from 'vitest';

// server-only throws when evaluated outside Next.js server components. Tests run in
// a Node environment, so we stub it to a no-op module.
vi.mock('server-only', () => ({}), { virtual: true });

// Creem Better Auth plugin is optional and may not be installed in test env.
// Stub its modules to avoid ERR_MODULE_NOT_FOUND while keeping behavior inert.
vi.mock(
  '@creem_io/better-auth',
  () => ({
    creem: () => ({}),
  }),
  { virtual: true }
);

vi.mock(
  '@creem_io/better-auth/server',
  () => ({
    checkSubscriptionAccess: vi.fn().mockResolvedValue({ hasAccess: false }),
  }),
  { virtual: true }
);
