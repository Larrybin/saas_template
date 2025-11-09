import { OpenPanelComponent } from '@openpanel/nextjs';
import { clientEnv } from '@/env/client';

/**
 * OpenPanel Analytics (https://openpanel.dev)
 *
 * https://openpanel.dev
 * https://mksaas.com/docs/analytics#openpanel
 * https://docs.openpanel.dev/docs/sdks/nextjs#options
 */
export default function OpenPanelAnalytics() {
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  const clientId = clientEnv.analytics.openPanelClientId;
  if (!clientId) {
    return null;
  }

  return (
    <OpenPanelComponent
      clientId={clientId}
      trackScreenViews={true}
      trackAttributes={true}
      trackOutgoingLinks={true}
    />
  );
}
