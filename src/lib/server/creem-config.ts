import { websiteConfig } from '@/config/website';

const envValue = process.env.CREEM_BETTER_AUTH_ENABLED;
const isCreemProvider = websiteConfig.payment.provider === 'creem';

export const isCreemBetterAuthEnabled = (() => {
  if (envValue === 'true') {
    return true;
  }
  if (envValue === 'false') {
    return false;
  }
  return isCreemProvider;
})();
