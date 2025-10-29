'use client';

import { Button } from '@/components/ui/button';
import { useConsumeCredits, useCreditBalance } from '@/hooks/use-credits';
import { CoinsIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const CONSUME_CREDITS = 10;

export function ConsumeCreditsCard() {
  const { data: balance = 0, isLoading: isLoadingBalance } = useCreditBalance();
  const consumeCreditsMutation = useConsumeCredits();
  const [loading, setLoading] = useState(false);

  const hasEnoughCredits = (amount: number) => balance >= amount;

  const handleConsume = async () => {
    if (!hasEnoughCredits(CONSUME_CREDITS)) {
      toast.error('Insufficient credits, please buy more credits.');
      return;
    }
    setLoading(true);
    try {
      await consumeCreditsMutation.mutateAsync({
        amount: CONSUME_CREDITS,
        description: `Test credit consumption (${CONSUME_CREDITS} credits)`,
      });
      toast.success(`${CONSUME_CREDITS} credits consumed successfully!`);
    } catch (error) {
      toast.error('Failed to consume credits');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg space-y-4">
      <h3 className="text-lg font-semibold">Credits Store Test</h3>

      <div className="space-y-2">
        <p>
          <strong>Store Balance:</strong> {balance}
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleConsume}
          disabled={
            loading || consumeCreditsMutation.isPending || isLoadingBalance
          }
          size="sm"
        >
          <CoinsIcon className="w-4 h-4 mr-2" />
          Consume {CONSUME_CREDITS} Credits
        </Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
    </div>
  );
}
