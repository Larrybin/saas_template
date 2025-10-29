import BillingCard from '@/components/settings/billing/billing-card';

/**
 * Billing page, show billing information
 */
export default function BillingPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <BillingCard />
      </div>
    </div>
  );
}
