import { getLogger } from '@/lib/server/logger';

const securityLogger = getLogger({
  span: 'payment.security',
});

const counters = {
  priceMismatch: 0,
};

type PriceMismatchContext = {
  packageId: string;
  providedPriceId?: string;
  expectedPriceId: string;
  customerEmail?: string;
};

export function recordPriceMismatchEvent(context: PriceMismatchContext) {
  counters.priceMismatch += 1;
  securityLogger.warn(
    {
      event: 'credit_price_mismatch_rejected',
      occurrences: counters.priceMismatch,
      ...context,
    },
    'Rejected credit checkout due to price mismatch'
  );
}
