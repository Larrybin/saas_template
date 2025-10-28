import { getCreditPackages } from '@/config/credits-config';
import type { CreditPackage } from './types';

/**
 * Get credit packages, used in client components
 * @returns Credit packages
 */
export function getCreditPackagesInClient(): CreditPackage[] {
  return Object.values(getCreditPackages());
}

/**
 * Get credit package by id, used in client components
 * @param id - Credit package id
 * @returns Credit package
 */
export function getCreditPackageByIdInClient(
  id: string
): CreditPackage | undefined {
  return getCreditPackagesInClient().find((pkg) => pkg.id === id);
}
