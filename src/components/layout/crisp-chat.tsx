'use client';

import { Crisp } from 'crisp-sdk-web';
import { useEffect } from 'react';
import { websiteConfig } from '@/config/website';
import { clientEnv } from '@/env/client';
import { clientLogger } from '@/lib/client-logger';

/**
 * Crisp chat component
 * https://crisp.chat/en/
 * https://help.crisp.chat/en/article/how-do-i-install-crisp-live-chat-on-nextjs-xh9yse/
 */
const CrispChat = () => {
  useEffect(() => {
    if (!websiteConfig.features.enableCrispChat) {
      clientLogger.debug('Crisp chat is disabled');
      return;
    }

    const websiteId = clientEnv.crispWebsiteId;
    if (!websiteId) {
      clientLogger.warn('Crisp website ID is not configured.');
      return;
    }

    try {
      Crisp.configure(websiteId);
      clientLogger.info('Crisp chat initialized successfully');
    } catch (error) {
      clientLogger.error('Failed to initialize Crisp chat:', error);
    }
  }, []);

  return null;
};

export default CrispChat;
