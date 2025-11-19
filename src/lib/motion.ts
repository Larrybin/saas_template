import type { Transition, Variants } from 'motion/react';

/**
 * Type-safe helper to define motion transitions without losing literal types.
 * Motion 12's typings are stricter about easing/type inference; wrapping configs
 * through this helper keeps autocompletion while satisfying `Transition`.
 */
export const defineTransition = <T extends Transition>(config: T): T => config;

/**
 * Helper for variants to make sure nested transitions also satisfy Motion types.
 */
export const defineVariants = <T extends Variants>(variants: T): T => variants;
