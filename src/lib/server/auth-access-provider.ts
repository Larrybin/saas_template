import { setExternalAccessProvider } from '@/lib/auth-domain';
import { getLogger } from '@/lib/server/logger';
import { isCreemBetterAuthEnabled } from './creem-config';
import { createCreemExternalAccessProvider } from './creem-external-access-provider';

const logger = getLogger({ span: 'auth-domain.external-access.bootstrap' });

if (isCreemBetterAuthEnabled) {
  logger.info(
    'Initializing Creem ExternalAccessProvider via Better Auth integration (Phase B-Plugin)'
  );
  setExternalAccessProvider(createCreemExternalAccessProvider());
} else {
  logger.debug(
    'CREEM_BETTER_AUTH_ENABLED is not set to true; using default no-op ExternalAccessProvider'
  );
}
