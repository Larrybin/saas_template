'use client';

import type { LoadingStatesProps } from '@/ai/text/utils/web-content-analyzer';
import { Progress } from '@/components/ui/progress';
import { BotIcon, Globe2Icon, Loader2Icon, SearchIcon } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';

export const LoadingStates = memo(function LoadingStates({
  stage,
  url,
}: LoadingStatesProps) {
  const [progress, setProgress] = useState(0);

  // Simulate progress animation
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (stage === 'scraping') {
          // Scraping progress: 0-60%
          return prev < 60 ? prev + 2 : 60;
        }
        if (stage === 'analyzing') {
          // Analyzing progress: 60-100%
          return prev < 100 ? prev + 1.5 : 100;
        }
        return prev;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [stage]);

  // Reset progress when stage changes
  useEffect(() => {
    if (stage === 'scraping') {
      setProgress(0);
    } else if (stage === 'analyzing') {
      setProgress(60);
    }
  }, [stage]);

  // Memoize stage configuration to prevent unnecessary recalculations
  const config = useMemo(() => {
    const hostname = url
      ? (() => {
          try {
            return new URL(url).hostname;
          } catch {
            return 'the webpage';
          }
        })()
      : 'the webpage';

    switch (stage) {
      case 'scraping':
        return {
          icon: Globe2Icon,
          title: 'Scraping URL...',
          description: `Extracting content from ${hostname}`,
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-50 dark:bg-blue-950/20',
          borderColor: 'border-blue-200 dark:border-blue-800',
        };
      case 'analyzing':
        return {
          icon: BotIcon,
          title: 'Analyzing content...',
          description: 'AI is processing and structuring the webpage content',
          color: 'text-purple-600 dark:text-purple-400',
          bgColor: 'bg-purple-50 dark:bg-purple-950/20',
          borderColor: 'border-purple-200 dark:border-purple-800',
        };
      default:
        return {
          icon: Loader2Icon,
          title: 'Processing...',
          description: 'Please wait while we process your request',
          color: 'text-gray-600 dark:text-gray-400',
          bgColor: 'bg-gray-50 dark:bg-gray-950/20',
          borderColor: 'border-gray-200 dark:border-gray-800',
        };
    }
  }, [stage, url]);

  const IconComponent = config.icon;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        className={`rounded-lg border p-6 ${config.bgColor} ${config.borderColor} transition-all duration-300`}
      >
        <div className="flex items-center space-x-4">
          <div className="flex-shrink-0">
            <div
              className={`rounded-full p-3 ${config.bgColor} ${config.borderColor} border`}
            >
              <IconComponent
                className={`size-6 ${config.color} ${
                  stage === 'scraping' || stage === 'analyzing'
                    ? 'animate-pulse'
                    : 'animate-spin'
                }`}
                aria-hidden="true"
              />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-lg font-semibold ${config.color}`}>
                {config.title}
              </h3>
              <span className="text-sm text-muted-foreground font-medium">
                {Math.round(progress)}%
              </span>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              {config.description}
            </p>

            <div className="space-y-2">
              <Progress
                value={progress}
                className="h-2"
                aria-label={`${config.title} ${Math.round(progress)}% complete`}
              />

              <div className="flex justify-between text-xs text-muted-foreground">
                <span
                  className={
                    stage === 'scraping' || progress >= 60
                      ? config.color
                      : 'text-muted-foreground'
                  }
                >
                  Scraping content
                </span>
                <span
                  className={
                    stage === 'analyzing' || progress >= 60
                      ? config.color
                      : 'text-muted-foreground'
                  }
                >
                  AI analysis
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
