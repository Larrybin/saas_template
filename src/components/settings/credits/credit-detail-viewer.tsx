import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Separator } from '@/components/ui/separator';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatDate } from '@/lib/formatter';
import {
  BanknoteIcon,
  ClockIcon,
  CoinsIcon,
  GemIcon,
  GiftIcon,
  HandCoinsIcon,
  ShoppingCartIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CREDIT_TRANSACTION_TYPE } from '../../../credits/types';

// Define the credit transaction interface (matching the one in the table)
export interface CreditTransaction {
  id: string;
  userId: string;
  type: string;
  description: string | null;
  amount: number;
  remainingAmount: number | null;
  paymentId: string | null;
  expirationDate: Date | null;
  expirationDateProcessedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CreditDetailViewerProps {
  transaction: CreditTransaction;
}

export function CreditDetailViewer({ transaction }: CreditDetailViewerProps) {
  const t = useTranslations('Dashboard.settings.credits.transactions');
  const isMobile = useIsMobile();

  // Get transaction type icon
  const getTransactionTypeIcon = (type: string) => {
    switch (type) {
      case CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH:
        return <HandCoinsIcon className="h-5 w-5" />;
      case CREDIT_TRANSACTION_TYPE.REGISTER_GIFT:
        return <GiftIcon className="h-5 w-5" />;
      case CREDIT_TRANSACTION_TYPE.PURCHASE_PACKAGE:
        return <ShoppingCartIcon className="h-5 w-5" />;
      case CREDIT_TRANSACTION_TYPE.USAGE:
        return <CoinsIcon className="h-5 w-5" />;
      case CREDIT_TRANSACTION_TYPE.EXPIRE:
        return <ClockIcon className="h-5 w-5" />;
      case CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL:
        return <BanknoteIcon className="h-5 w-5" />;
      case CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY:
        return <GemIcon className="h-5 w-5" />;
      default:
        return null;
    }
  };

  // Get transaction type display name
  const getTransactionTypeDisplayName = (type: string) => {
    switch (type) {
      case CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH:
        return t('types.MONTHLY_REFRESH');
      case CREDIT_TRANSACTION_TYPE.REGISTER_GIFT:
        return t('types.REGISTER_GIFT');
      case CREDIT_TRANSACTION_TYPE.PURCHASE_PACKAGE:
        return t('types.PURCHASE');
      case CREDIT_TRANSACTION_TYPE.USAGE:
        return t('types.USAGE');
      case CREDIT_TRANSACTION_TYPE.EXPIRE:
        return t('types.EXPIRE');
      case CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL:
        return t('types.SUBSCRIPTION_RENEWAL');
      case CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY:
        return t('types.LIFETIME_MONTHLY');
      default:
        return type;
    }
  };

  return (
    <Drawer direction={isMobile ? 'bottom' : 'right'}>
      <DrawerTrigger asChild>
        <Button
          variant="link"
          className="cursor-pointer text-foreground w-fit px-3 text-left h-auto"
        >
          <div className="flex items-center gap-2">
            <span
              className={`font-medium ${
                transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {transaction.amount > 0 ? '+' : ''}
              {transaction.amount.toLocaleString()}
            </span>
          </div>
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{t('detailViewer.title')}</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 text-sm">
          <div className="grid gap-4">
            <div className="flex items-center gap-2">
              {/* Transaction Type Badge */}
              <Badge
                variant="outline"
                className="hover:bg-accent transition-colors"
              >
                {getTransactionTypeIcon(transaction.type)}
                {getTransactionTypeDisplayName(transaction.type)}
              </Badge>
            </div>

            {/* Basic Information */}
            <div className="grid gap-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  {t('columns.amount')}:
                </span>
                <span
                  className={`font-medium ${
                    transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {transaction.amount > 0 ? '+' : ''}
                  {transaction.amount.toLocaleString()}
                </span>
              </div>

              {transaction.remainingAmount !== null && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    {t('columns.remainingAmount')}:
                  </span>
                  <span className="font-medium">
                    {transaction.remainingAmount.toLocaleString()}
                  </span>
                </div>
              )}

              {transaction.description && (
                <div className="grid gap-3">
                  <span className="text-muted-foreground text-xs">
                    {t('columns.description')}:
                  </span>
                  <span className="break-words">{transaction.description}</span>
                </div>
              )}

              {transaction.paymentId && (
                <div className="grid gap-3">
                  <span className="text-muted-foreground text-xs">
                    {t('columns.paymentId')}:
                  </span>
                  <span
                    className="font-mono text-sm cursor-pointer hover:bg-accent px-2 py-1 rounded border break-all"
                    onClick={() => {
                      navigator.clipboard.writeText(transaction.paymentId!);
                      toast.success(t('paymentIdCopied'));
                    }}
                  >
                    {transaction.paymentId}
                  </span>
                </div>
              )}

              {transaction.expirationDate && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    {t('columns.expirationDate')}:
                  </span>
                  <span>{formatDate(transaction.expirationDate)}</span>
                </div>
              )}

              {transaction.expirationDateProcessedAt && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    {t('columns.expirationDateProcessedAt')}:
                  </span>
                  <span>
                    {formatDate(transaction.expirationDateProcessedAt)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Timestamps */}
          <div className="grid gap-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">
                {t('columns.createdAt')}:
              </span>
              <span>{formatDate(transaction.createdAt)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">
                {t('columns.updatedAt')}:
              </span>
              <span>{formatDate(transaction.updatedAt)}</span>
            </div>
          </div>
        </div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline" className="cursor-pointer">
              {t('detailViewer.close')}
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
