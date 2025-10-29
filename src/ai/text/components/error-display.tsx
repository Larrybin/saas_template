'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  ClockIcon,
  CreditCardIcon,
  HelpCircleIcon,
  InfoIcon,
  RefreshCwIcon,
  ServerIcon,
  ShieldIcon,
  WifiOffIcon,
} from 'lucide-react';
import { useState } from 'react';
import {
  ErrorSeverity,
  ErrorType,
  type WebContentAnalyzerError,
  getRecoveryActions,
} from '../utils/error-handling';

interface ErrorDisplayProps {
  error: WebContentAnalyzerError;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

// Error icon mapping
const errorIcons = {
  [ErrorType.VALIDATION]: AlertCircleIcon,
  [ErrorType.NETWORK]: WifiOffIcon,
  [ErrorType.SCRAPING]: ServerIcon,
  [ErrorType.ANALYSIS]: HelpCircleIcon,
  [ErrorType.TIMEOUT]: ClockIcon,
  [ErrorType.RATE_LIMIT]: ClockIcon,
  [ErrorType.AUTHENTICATION]: ShieldIcon,
  [ErrorType.SERVICE_UNAVAILABLE]: ServerIcon,
  [ErrorType.UNKNOWN]: AlertTriangleIcon,
};

// Severity color mapping
const severityColors = {
  [ErrorSeverity.LOW]: {
    border: 'border-blue-200 dark:border-blue-800',
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    titleColor: 'text-blue-800 dark:text-blue-200',
    textColor: 'text-blue-700 dark:text-blue-300',
  },
  [ErrorSeverity.MEDIUM]: {
    border: 'border-yellow-200 dark:border-yellow-800',
    bg: 'bg-yellow-50 dark:bg-yellow-950/20',
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    titleColor: 'text-yellow-800 dark:text-yellow-200',
    textColor: 'text-yellow-700 dark:text-yellow-300',
  },
  [ErrorSeverity.HIGH]: {
    border: 'border-red-200 dark:border-red-800',
    bg: 'bg-red-50 dark:bg-red-950/20',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    titleColor: 'text-red-800 dark:text-red-200',
    textColor: 'text-red-700 dark:text-red-300',
  },
  [ErrorSeverity.CRITICAL]: {
    border: 'border-red-200 dark:border-red-800',
    bg: 'bg-red-50 dark:bg-red-950/20',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    titleColor: 'text-red-800 dark:text-red-200',
    textColor: 'text-red-700 dark:text-red-300',
  },
};

// Error title mapping
const errorTitles = {
  [ErrorType.VALIDATION]: 'Invalid Input',
  [ErrorType.NETWORK]: 'Connection Error',
  [ErrorType.SCRAPING]: 'Unable to Access Website',
  [ErrorType.ANALYSIS]: 'Analysis Failed',
  [ErrorType.TIMEOUT]: 'Request Timed Out',
  [ErrorType.RATE_LIMIT]: 'Rate Limit Exceeded',
  [ErrorType.AUTHENTICATION]: 'Authentication Required',
  [ErrorType.SERVICE_UNAVAILABLE]: 'Service Unavailable',
  [ErrorType.UNKNOWN]: 'Unexpected Error',
};

export function ErrorDisplay({
  error,
  onRetry,
  onDismiss,
  className,
}: ErrorDisplayProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  const Icon = errorIcons[error.type];
  const colors = severityColors[error.severity];
  const title = errorTitles[error.type];
  const recoveryActions = getRecoveryActions(error);

  const handleRetry = async () => {
    if (!onRetry) return;

    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleAction = (action: string) => {
    switch (action) {
      case 'retry':
        handleRetry();
        break;
      case 'refresh':
        window.location.reload();
        break;
      case 'check_connection':
        // Could open a network diagnostic or help page
        window.open('https://www.google.com', '_blank');
        break;
      case 'purchase_credits':
        // Navigate to credits purchase page
        window.location.href = '/settings/billing';
        break;
      case 'check_balance':
        // Navigate to dashboard
        window.location.href = '/dashboard';
        break;
      case 'sign_in':
        // Navigate to sign in
        window.location.href = '/auth/login';
        break;
      case 'check_status':
        // Could open status page
        console.log('Check service status');
        break;
      case 'report_issue':
        // Could open support form
        console.log('Report issue');
        break;
      case 'wait_retry':
        // Wait a bit then retry
        setTimeout(handleRetry, 5000);
        break;
      case 'try_later':
        onDismiss?.();
        break;
      default:
        handleRetry();
    }
  };

  return (
    <Card className={cn('w-full max-w-2xl mx-auto', className)}>
      <CardHeader>
        <div className={cn('rounded-lg border p-6', colors.border, colors.bg)}>
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              <div className={cn('rounded-full p-2', colors.iconBg)}>
                <Icon className={cn('size-5', colors.iconColor)} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle
                className={cn('text-lg font-semibold', colors.titleColor)}
              >
                {title}
              </CardTitle>
              <p className={cn('mt-2 text-sm', colors.textColor)}>
                {error.userMessage}
              </p>

              {/* Show technical details in development */}
              {process.env.NODE_ENV === 'development' && (
                <details className="mt-3">
                  <summary
                    className={cn('text-xs cursor-pointer', colors.textColor)}
                  >
                    Technical Details
                  </summary>
                  <pre
                    className={cn(
                      'mt-2 text-xs whitespace-pre-wrap',
                      colors.textColor
                    )}
                  >
                    Type: {error.type}
                    {'\n'}Severity: {error.severity}
                    {'\n'}Retryable: {error.retryable ? 'Yes' : 'No'}
                    {'\n'}Message: {error.message}
                    {error.originalError &&
                      `\nOriginal: ${error.originalError.message}`}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-wrap gap-2">
          {recoveryActions.map((action, index) => (
            <Button
              key={index}
              variant={action.primary ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleAction(action.action)}
              disabled={isRetrying && action.action === 'retry'}
              className="flex items-center gap-2 cursor-pointer"
            >
              {isRetrying && action.action === 'retry' ? (
                <RefreshCwIcon className="size-4 animate-spin" />
              ) : action.action === 'retry' ? (
                <RefreshCwIcon className="size-4" />
              ) : action.action === 'refresh' ? (
                <RefreshCwIcon className="size-4" />
              ) : action.action === 'check_connection' ? (
                <WifiOffIcon className="size-4" />
              ) : action.action === 'purchase_credits' ? (
                <CreditCardIcon className="size-4" />
              ) : action.action === 'sign_in' ? (
                <ShieldIcon className="size-4" />
              ) : (
                <InfoIcon className="size-4" />
              )}
              {action.label}
            </Button>
          ))}

          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="ml-auto cursor-pointer"
            >
              Dismiss
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Simplified error display for inline use
export function InlineErrorDisplay({
  error,
  onRetry,
  className,
}: {
  error: WebContentAnalyzerError;
  onRetry?: () => void;
  className?: string;
}) {
  const [isRetrying, setIsRetrying] = useState(false);
  const colors = severityColors[error.severity];

  const handleRetry = async () => {
    if (!onRetry) return;

    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-3 rounded-lg border',
        colors.border,
        colors.bg,
        className
      )}
    >
      <AlertCircleIcon
        className={cn('size-4 flex-shrink-0', colors.iconColor)}
      />
      <span className={cn('text-sm flex-1', colors.textColor)}>
        {error.userMessage}
      </span>
      {error.retryable && onRetry && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRetry}
          disabled={isRetrying}
          className={cn('cursor-pointer h-auto p-1', colors.textColor)}
        >
          {isRetrying ? (
            <RefreshCwIcon className="size-4 animate-spin" />
          ) : (
            <RefreshCwIcon className="size-4" />
          )}
        </Button>
      )}
    </div>
  );
}
