import { websiteConfig } from '@/config/website';
import type { CreditPackage } from './types';

/**
 * Get all credit packages, can be used in server or client components
 * @returns Credit packages
 */
export function getAllCreditPackages(): CreditPackage[] {
  return Object.values(websiteConfig.credits.packages);
}

/**
 * Get credit package by id, can be used in server or client components
 * @param id - Credit package id
 * @returns Credit package
 */
export function getCreditPackageById(id: string): CreditPackage | undefined {
  return getAllCreditPackages().find((pkg) => pkg.id === id);
}
