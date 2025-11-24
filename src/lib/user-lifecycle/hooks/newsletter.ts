import { websiteConfig } from '@/config/website';
import { getLogger } from '@/lib/server/logger';
import { subscribe } from '@/newsletter';
import type { UserLifecycleHook } from '../types';

const NEWSLETTER_DELAY_MS = 2000;
const logger = getLogger({ span: 'user-lifecycle.newsletter' });

export function createNewsletterAutoSubscribeHook(): UserLifecycleHook<'user.created'> {
  return ({ user }) => {
    if (
      !user.email ||
      !websiteConfig.newsletter.enable ||
      !websiteConfig.newsletter.autoSubscribeAfterSignUp
    ) {
      return;
    }

    setTimeout(async () => {
      try {
        const email = user.email;
        if (!email) return;
        const subscribed = await subscribe(email);
        if (!subscribed) {
          logger.error(
            { userEmail: user.email },
            'Failed to subscribe user to newsletter'
          );
        }
      } catch (error) {
        logger.error(
          { error, userEmail: user.email },
          'Newsletter subscription error'
        );
      }
    }, NEWSLETTER_DELAY_MS);
  };
}
