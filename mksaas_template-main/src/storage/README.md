# Storage Module

This module provides a unified interface for storing and retrieving files using various cloud storage providers. Currently, it supports Amazon S3 and compatible services like Cloudflare R2 using the `s3mini` library for better Cloudflare Workers compatibility.

## Features

- Upload files to cloud storage
- Delete files from storage
- Client-side upload helpers through API endpoints
- Cloudflare Workers compatible using s3mini

## Basic Usage

```typescript
import { uploadFile, deleteFile } from '@/storage';

// Upload a file
const { url, key } = await uploadFile(
  fileBuffer,
  'original-filename.jpg',
  'image/jpeg',
  'uploads/images'
);

// Delete a file
await deleteFile(key);
```

## Client-Side Upload

For client-side uploads, use the `uploadFileFromBrowser` function:

```typescript
'use client';

import { uploadFileFromBrowser } from '@/storage/client';

// In your component
async function handleFileUpload(event) {
  const file = event.target.files[0];

  try {
    // All uploads go through the direct upload API endpoint
    // since s3mini doesn't support presigned URLs
    const { url, key } = await uploadFileFromBrowser(file, 'uploads/images');
    console.log('File uploaded:', url);
  } catch (error) {
    console.error('Upload failed:', error);
  }
}
```

## Configuration

The storage module is configured in two ways:

1. In `src/config/website.tsx`:

```typescript
// In src/config/website.tsx
export const websiteConfig = {
  // ...other config
  storage: {
    provider: 's3',
  },
  // ...other config
}
```

2. Using environment variables:

```
# Required
STORAGE_REGION=auto
STORAGE_ACCESS_KEY_ID=your-access-key
STORAGE_SECRET_ACCESS_KEY=your-secret-key
STORAGE_BUCKET_NAME=your-bucket-name
STORAGE_ENDPOINT=https://custom-endpoint.com
STORAGE_PUBLIC_URL=https://cdn.example.com
```

**Note**: When using s3mini, the `STORAGE_ENDPOINT` is required and the bucket name will be included in the endpoint URL.

## Advanced Usage

### Using the Storage Provider Directly

If you need more control, you can interact with the storage provider directly:

```typescript
import { getStorageProvider } from '@/storage';

const provider = getStorageProvider();

// Use provider methods directly
const result = await provider.uploadFile({
  file: fileBuffer,
  filename: 'example.pdf',
  contentType: 'application/pdf',
  folder: 'documents'
});
```

### Using a Custom Provider Implementation

You can create and use your own storage provider implementation:

```typescript
import { StorageProvider, UploadFileParams, UploadFileResult } from '@/storage/types';

class CustomStorageProvider implements StorageProvider {
  // Implement the required methods
  async uploadFile(params: UploadFileParams): Promise<UploadFileResult> {
    // Your implementation
    return { url: 'https://example.com/file.jpg', key: 'file.jpg' };
  }

  async deleteFile(key: string): Promise<void> {
    // Your implementation
  }

  getProviderName(): string {
    return 'CustomProvider';
  }
}

// Then use it
const customProvider = new CustomStorageProvider();
const result = await customProvider.uploadFile({
  file: fileBuffer,
  filename: 'example.jpg',
  contentType: 'image/jpeg'
});
```

## Important Limitations

### s3mini Limitations

Since this implementation uses `s3mini` for Cloudflare Workers compatibility, there are some limitations compared to the full AWS SDK:

- **No Presigned URLs**: s3mini doesn't support presigned URLs. All browser uploads must go through your API server.
- **Endpoint Configuration**: The bucket name is included in the endpoint URL configuration.
- **Manual URL Construction**: File URLs are constructed manually rather than using AWS SDK's getSignedUrl.

## API Reference

### Server-Side Functions

For server-side usage (in API routes, server actions, etc.):

- `uploadFile(file, filename, contentType, folder?)`: Upload a file to storage
- `deleteFile(key)`: Delete a file from storage

### Client-Side Functions

For client-side usage (in React components with 'use client'):

- `uploadFileFromBrowser(file, folder?)`: Upload a file from the browser (via API)

**Note**: Import client-side functions from `@/storage/client` to avoid Node.js module conflicts in the browser.

### Provider Interface

The `StorageProvider` interface defines the following methods:

- `uploadFile(params)`: Upload a file to storage
- `deleteFile(key)`: Delete a file from storage
- `getProviderName()`: Get the provider name

### Configuration

The `StorageConfig` interface defines the configuration options:

- `region`: Storage region (e.g., 'auto' for Cloudflare R2)
- `endpoint?`: Custom endpoint URL for S3-compatible services (required for s3mini)
- `accessKeyId`: Access key ID for authentication
- `secretAccessKey`: Secret access key for authentication
- `bucketName`: Storage bucket name
- `publicUrl?`: Public URL for accessing files
