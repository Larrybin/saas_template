'use client';

import { CoinsIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConsumeCredits, useCreditBalance } from '@/hooks/use-credits';
import { useCreditsErrorUi } from '@/hooks/use-credits-error-ui';

const CONSUME_CREDITS = 10;

/**
 * Credits Devtools Card
 *
 * 调试 / 内部使用组件，用于在开发环境中快速验证积分消费链路。
 * 请勿在生产环境挂载或暴露给真实用户。
 */
export function ConsumeCreditsCard() {
  const { data: balance = 0, isLoading: isLoadingBalance } = useCreditBalance();
  const consumeCreditsMutation = useConsumeCredits();
  const [loading, setLoading] = useState(false);
  const { handleCreditsError } = useCreditsErrorUi();

  const hasEnoughCredits = (amount: number) => balance >= amount;

  const handleConsume = async () => {
    // 乐观前置检查，避免明显无效请求
    if (!hasEnoughCredits(CONSUME_CREDITS)) {
      handleCreditsError({ code: 'CREDITS_INSUFFICIENT_BALANCE' });
      return;
    }

    setLoading(true);
    try {
      await consumeCreditsMutation.mutateAsync({
        amount: CONSUME_CREDITS,
        description: `Test credit consumption (${CONSUME_CREDITS} credits)`,
      });
      toast.success('Test credits consumed', {
        description: `${CONSUME_CREDITS} credits removed successfully.`,
      });
    } catch (error) {
      handleCreditsError(error as Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div>
        <h3 className="text-lg font-semibold text-destructive">
          Credits Devtools（调试用途，仅限内部使用）
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          此卡片仅用于开发/测试环境快速验证积分消费链路，请勿在真实用户可见的页面中使用。
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm">
          <strong>Test Balance:</strong> {balance}
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleConsume}
          disabled={
            loading || consumeCreditsMutation.isPending || isLoadingBalance
          }
          size="sm"
          variant="outline"
        >
          <CoinsIcon className="mr-2 h-4 w-4" />
          Consume {CONSUME_CREDITS} Credits (Test)
        </Button>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground">
          Processing test request…
        </p>
      )}
    </div>
  );
}
