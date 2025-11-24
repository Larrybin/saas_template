import { vi } from 'vitest';

// server-only throws when evaluated outside Next.js server components. Tests run in
// a Node environment, so we stub it to a no-op module.
vi.mock('server-only', () => ({}), { virtual: true });
