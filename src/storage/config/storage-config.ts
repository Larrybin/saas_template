import { serverEnv } from '@/env/server';
import type { StorageConfig } from '../types';

/**
 * Default storage configuration
 *
 * This configuration is loaded from environment variables
 */
export const storageConfig: StorageConfig = {
  region: serverEnv.storage.region ?? '',
  ...(serverEnv.storage.endpoint
    ? { endpoint: serverEnv.storage.endpoint }
    : {}),
  accessKeyId: serverEnv.storage.accessKeyId ?? '',
  secretAccessKey: serverEnv.storage.secretAccessKey ?? '',
  bucketName: serverEnv.storage.bucketName ?? '',
  ...(serverEnv.storage.publicUrl
    ? { publicUrl: serverEnv.storage.publicUrl }
    : {}),
  forcePathStyle: serverEnv.storage.forcePathStyle,
};
