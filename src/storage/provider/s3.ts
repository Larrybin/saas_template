import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3mini } from 's3mini';
import { getLogger } from '@/lib/server/logger';
import { storageConfig } from '../config/storage-config';
import {
  ConfigurationError,
  type StorageConfig,
  StorageError,
  type StorageProvider,
  UploadError,
  type UploadFileParams,
  type UploadFileResult,
} from '../types';

const logger = getLogger({ span: 'storage.s3-provider' });

/**
 * Amazon S3 storage provider implementation using s3mini
 *
 * docs:
 * https://mksaas.com/docs/storage
 *
 * This provider works with Amazon S3 and compatible services like Cloudflare R2
 * using s3mini for better Cloudflare Workers compatibility
 * https://github.com/good-lly/s3mini
 * https://developers.cloudflare.com/r2/
 */
export class S3Provider implements StorageProvider {
  private config: StorageConfig;
  private s3Client: S3mini | null = null;
  private awsClient: S3Client | null = null;

  constructor(config: StorageConfig = storageConfig) {
    this.config = config;
  }

  /**
   * Get the provider name
   */
  public getProviderName(): string {
    return 'S3';
  }

  /**
   * Get the S3 client instance
   */
  private getS3Client(): S3mini {
    if (this.s3Client) {
      return this.s3Client;
    }

    const { region, endpoint, accessKeyId, secretAccessKey, bucketName } =
      this.validateConfig();

    // s3mini client configuration
    // The bucket name needs to be included in the endpoint URL for s3mini
    const endpointWithBucket = `${endpoint.replace(/\/$/, '')}/${bucketName}`;

    this.s3Client = new S3mini({
      accessKeyId,
      secretAccessKey,
      endpoint: endpointWithBucket,
      region,
    });

    return this.s3Client;
  }

  private getAwsClient(): S3Client {
    if (this.awsClient) {
      return this.awsClient;
    }

    const { region, endpoint, accessKeyId, secretAccessKey, forcePathStyle } =
      this.validateConfig();

    this.awsClient = new S3Client({
      region,
      endpoint,
      // Cloudflare R2/MinIO 等兼容提供方默认使用 path-style URL
      forcePathStyle: forcePathStyle ?? true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    return this.awsClient;
  }

  private validateConfig(): StorageConfig & {
    region: string;
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
  } {
    const { region, endpoint, accessKeyId, secretAccessKey, bucketName } =
      this.config;
    if (!region) {
      throw new ConfigurationError('Storage region is not configured');
    }

    if (!accessKeyId || !secretAccessKey) {
      throw new ConfigurationError('Storage credentials are not configured');
    }

    if (!endpoint) {
      throw new ConfigurationError('Storage endpoint is required for s3mini');
    }

    if (!endpoint.startsWith('https://')) {
      throw new ConfigurationError('Storage endpoint must use HTTPS');
    }

    if (!bucketName) {
      throw new ConfigurationError('Storage bucket name is not configured');
    }

    if (this.config.publicUrl && !this.config.publicUrl.startsWith('https://')) {
      throw new ConfigurationError('Storage publicUrl must use HTTPS');
    }

    return {
      ...this.config,
      region,
      endpoint,
      accessKeyId,
      secretAccessKey,
      bucketName,
    };
  }

  private resolvePublicUrl(key: string): string {
    const { publicUrl, endpoint } = this.config;

    if (publicUrl) {
      const base = publicUrl.replace(/\/$/, '');
      const url = `${base}/${key}`;
      logger.debug({ url, key }, 'Resolved public URL via public domain');
      return url;
    }

    const base = (endpoint ?? '').replace(/\/$/, '');
    const url = `${base}/${key}`;
    logger.debug({ url, key }, 'Resolved public URL from endpoint');
    return url;
  }

  /**
   * Generate a unique filename with the original extension
   */
  private generateUniqueFilename(originalFilename: string): string {
    const extension = originalFilename.split('.').pop() || '';
    const uuid = randomUUID();
    return `${uuid}${extension ? `.${extension}` : ''}`;
  }

  private async withRetry<T>(
    operation: 'upload' | 'delete',
    key: string,
    fn: (attempt: number) => Promise<T>
  ): Promise<T> {
    const maxAttempts = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await fn(attempt);
      } catch (error) {
        lastError = error;

        if (error instanceof ConfigurationError || attempt === maxAttempts) {
          throw error;
        }

        logger.error(
          { error, key, attempt, operation },
          'storage operation failed, will retry'
        );

        const delayMs = 100 * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError as Error;
  }

  /**
   * Upload a file to S3
   */
  public async uploadFile(params: UploadFileParams): Promise<UploadFileResult> {
    try {
      const { file, filename, contentType, folder } = params;
      const s3 = this.getS3Client();

      const uniqueFilename = this.generateUniqueFilename(filename);
      const key = folder ? `${folder}/${uniqueFilename}` : uniqueFilename;

      // Convert Blob to Buffer if needed
      let fileContent: Buffer | string;
      if (file instanceof Blob) {
        fileContent = Buffer.from(await file.arrayBuffer());
      } else {
        fileContent = file;
      }

      await this.withRetry('upload', key, async () => {
        const response = await s3.putObject(key, fileContent, contentType);

        if (!response.ok) {
          throw new UploadError(`Failed to upload file: ${response.statusText}`);
        }
      });

      const url = this.resolvePublicUrl(key);

      return { url, key };
    } catch (error) {
      if (error instanceof ConfigurationError) {
        logger.error({ error }, 'uploadFile configuration error');
        throw error;
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Unknown error occurred during file upload';
      logger.error({ error }, 'uploadFile error');
      throw new UploadError(message);
    }
  }

  /**
   * Delete a file from S3
   */
  public async deleteFile(key: string): Promise<void> {
    try {
      const s3 = this.getS3Client();

      await this.withRetry('delete', key, async () => {
        const wasDeleted = await s3.deleteObject(key);

        if (!wasDeleted) {
          logger.warn(
            { key },
            'File was not found or could not be deleted from storage'
          );
        }
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown error occurred during file deletion';
      logger.error({ error }, 'deleteFile error');
      throw new StorageError(message);
    }
  }

  public async createPresignedUploadUrl(params: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<{ uploadUrl: string; method: 'PUT'; publicUrl: string }> {
    try {
      const { key, contentType, expiresInSeconds } = params;
      const client = this.getAwsClient();

      const command = new PutObjectCommand({
        Bucket: this.validateConfig().bucketName,
        Key: key,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(client, command, {
        expiresIn: expiresInSeconds ?? 900,
      });

      const publicUrl = this.resolvePublicUrl(key);

      return {
        uploadUrl,
        method: 'PUT',
        publicUrl,
      };
    } catch (error) {
      if (error instanceof ConfigurationError) {
        logger.error({ error }, 'createPresignedUploadUrl configuration error');
        throw error;
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Unknown error occurred while generating presigned upload URL';
      logger.error({ error }, 'createPresignedUploadUrl error');
      throw new StorageError(message);
    }
  }
}
