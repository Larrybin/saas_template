import { cookies } from 'next/headers';
import { websiteConfig } from '@/config/website';

export const attachDatafastMetadata = async (
  baseMetadata: Record<string, string> | undefined
): Promise<Record<string, string>> => {
  const metadata: Record<string, string> = {
    ...(baseMetadata ?? {}),
  };

  if (!websiteConfig.features.enableDatafastRevenueTrack) {
    return metadata;
  }

  const cookieStore = await cookies();
  metadata.datafast_visitor_id =
    cookieStore.get('datafast_visitor_id')?.value ?? '';
  metadata.datafast_session_id =
    cookieStore.get('datafast_session_id')?.value ?? '';

  return metadata;
};
