'use client';

import type { AnalysisResultsProps } from '@/ai/text/utils/web-content-analyzer';
import { webContentAnalyzerConfig } from '@/ai/text/utils/web-content-analyzer-config';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  CalendarIcon,
  CreditCardIcon,
  ExternalLinkIcon,
  ImageIcon,
  InfoIcon,
  ListIcon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
  TagIcon,
} from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ImageOptimization,
  useLazyLoading,
  useStableCallback,
} from '../utils/performance';

// Memoized screenshot component for better performance
const LazyScreenshot = memo(
  ({
    screenshot,
    title,
    onLoad,
    onError,
  }: {
    screenshot: string;
    title: string;
    onLoad: () => void;
    onError: () => void;
  }) => {
    const [imageRef, isVisible] = useLazyLoading(
      webContentAnalyzerConfig.performance.lazyLoadingThreshold
    );
    const [imageLoading, setImageLoading] = useState(true);

    const handleImageLoad = useCallback(() => {
      setImageLoading(false);
      onLoad();
    }, [onLoad]);

    const handleImageError = useCallback(() => {
      setImageLoading(false);
      onError();
    }, [onError]);

    return (
      <div ref={imageRef} className="relative">
        {imageLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-lg">
            <RefreshCwIcon className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted">
          {isVisible && (
            <Image
              src={screenshot}
              alt={`Screenshot of ${title}`}
              fill
              className="object-cover object-top transition-opacity duration-300"
              style={{
                opacity: imageLoading ? 0 : 1,
              }}
              onLoad={handleImageLoad}
              onError={handleImageError}
              sizes="(max-width: 1024px) 100vw, 33vw"
              loading="lazy"
            />
          )}
        </div>
      </div>
    );
  }
);

LazyScreenshot.displayName = 'LazyScreenshot';

export const AnalysisResults = memo(function AnalysisResults({
  results,
  screenshot,
  onNewAnalysis,
}: AnalysisResultsProps) {
  const [imageError, setImageError] = useState(false);

  // Memoized utility functions to prevent re-creation on every render
  const formatDate = useCallback((dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Recently';
    }
  }, []);

  const getDomainFromUrl = useCallback((url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }, []);

  const handleImageLoad = useCallback(() => {
    // Image loaded successfully
  }, []);

  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  // Memoized domain and formatted date to prevent recalculation
  const domain = getDomainFromUrl(results.url);
  const formattedDate = formatDate(results.analyzedAt);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Header Section */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <CardTitle className="text-2xl font-bold leading-tight">
                {results.title}
              </CardTitle>
              <CardDescription className="text-base">
                {results.description}
              </CardDescription>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <ExternalLinkIcon className="size-4" />
                  <a
                    href={results.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-foreground transition-colors underline"
                  >
                    {domain}
                  </a>
                </div>
                <div className="flex items-center gap-1">
                  <CalendarIcon className="size-4" />
                  <span>Analyzed {formattedDate}</span>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Info section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Introduction Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <InfoIcon className="size-5" />
                Introduction
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {results.introduction}
              </p>
            </CardContent>
          </Card>

          {/* Features Section */}
          {results.features && results.features.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListIcon className="size-5" />
                  Features
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {results.features.map((feature, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-2" />
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {feature}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Use Cases Section */}
          {results.useCases && results.useCases.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TagIcon className="size-5" />
                  Use Cases
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {results.useCases.map((useCase, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {useCase}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pricing Section */}
          {results.pricing && results.pricing !== 'Not specified' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCardIcon className="size-5" />
                  Pricing
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {results.pricing}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Screenshot Sidebar */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="size-5" />
                Screenshot
              </CardTitle>
            </CardHeader>
            <CardContent>
              {screenshot && !imageError ? (
                <LazyScreenshot
                  screenshot={screenshot}
                  title={results.title}
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                />
              ) : (
                <div className="aspect-[4/3] flex items-center justify-center bg-muted rounded-lg border">
                  <div className="text-center space-y-2">
                    <ImageIcon className="size-8 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      {imageError
                        ? 'Failed to load screenshot'
                        : 'No screenshot available'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Action Section */}
      <div className="py-6">
        <div className="flex justify-center">
          <Button
            onClick={onNewAnalysis}
            size="lg"
            className="w-full max-w-md cursor-pointer"
          >
            <SparklesIcon className="size-4" />
            Analyze Another Website
          </Button>
        </div>
        {/* <Separator className="my-6" /> */}
      </div>
    </div>
  );
});
