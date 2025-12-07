import type { ComponentType, ReactNode } from 'react';

declare module '@testing-library/react' {
  export function act(callback: () => void | Promise<void>): Promise<void>;

  export interface RenderHookResult<T> {
    result: {
      current: T;
    };
  }

  export interface RenderHookOptions {
    wrapper?: ComponentType<{ children?: ReactNode }>;
  }

  export function renderHook<T>(
    hook: () => T,
    options?: RenderHookOptions
  ): RenderHookResult<T>;

  export function waitFor(callback: () => void | Promise<void>): Promise<void>;
}
