export type RemotePattern = {
  protocol: 'http' | 'https';
  hostname: string;
  pathname?: string;
};

export type ImageOptimizationConfig = {
  unoptimized: boolean;
  remotePatterns: RemotePattern[];
};

const remotePatterns: RemotePattern[] = [
  { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
  { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
  { protocol: 'https', hostname: 'randomuser.me' },
  { protocol: 'https', hostname: 'res.cloudinary.com' },
  { protocol: 'https', hostname: 'ik.imagekit.io' },
  { protocol: 'https', hostname: 'html.tailus.io' },
  { protocol: 'https', hostname: 'service.firecrawl.dev' },
];

export const imageOptimizationConfig: ImageOptimizationConfig = {
  unoptimized: process.env.DISABLE_IMAGE_OPTIMIZATION === 'true',
  remotePatterns,
};
