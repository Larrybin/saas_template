import type { z } from 'zod';

type EnvSource = Record<string, string | undefined>;

type MaskOptions = {
  /**
   * Number of leading characters to keep visible before the mask.
   * Defaults to 4.
   */
  keepLeading?: number;
  /**
   * When true, append the original value length for context.
   */
  revealLength?: boolean;
};

/**
 * Picks all keys described in the provided Zod object schema from the env source.
 * Keeps schema and raw env data in sync so new variables only need to be added once.
 */
export function pickEnv<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  source: EnvSource = process.env
): Record<keyof T, string | undefined> {
  if (!schema || typeof (schema as { shape?: unknown }).shape !== 'object') {
    throw new Error('pickEnv expects a ZodObject schema');
  }

  return Object.keys(schema.shape).reduce(
    (acc, key) => {
      acc[key as keyof T] = source[key];
      return acc;
    },
    {} as Record<keyof T, string | undefined>
  );
}

/**
 * Masks a single environment variable value, keeping only a small prefix.
 */
export function maskValue(
  value: string | undefined,
  { keepLeading = 4, revealLength }: MaskOptions = {}
): string | undefined {
  if (!value) {
    return value;
  }

  const safeKeep = Math.min(Math.max(keepLeading, 0), value.length);
  const prefix = value.slice(0, safeKeep);
  const suffix = revealLength ? ` (len ${value.length})` : '';

  return `${prefix}${prefix ? '***' : '***'}${suffix}`;
}

/**
 * Produces a masked snapshot of the provided environment dictionary.
 */
export function maskEnvSnapshot<T extends EnvSource>(
  env: T,
  options?: MaskOptions
): Record<keyof T, string | undefined> {
  return Object.keys(env).reduce(
    (acc, key) => {
      acc[key as keyof T] = maskValue(env[key], options);
      return acc;
    },
    {} as Record<keyof T, string | undefined>
  );
}
