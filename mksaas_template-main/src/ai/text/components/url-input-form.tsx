'use client';

import type { UrlInputFormProps } from '@/ai/text/utils/web-content-analyzer';
import { webContentAnalyzerConfig } from '@/ai/text/utils/web-content-analyzer-config';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { zodResolver } from '@hookform/resolvers/zod';
import { LinkIcon, Loader2Icon, SparklesIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useDebounce } from '../utils/performance';

// Form schema for URL input
const urlFormSchema = z.object({
  url: z.url().optional(), // Allow empty string for initial state
});

type UrlFormData = z.infer<typeof urlFormSchema>;

export function UrlInputForm({
  onSubmit,
  isLoading,
  disabled = false,
  modelProvider,
  setModelProvider,
}: UrlInputFormProps) {
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch by only rendering content after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  const form = useForm<UrlFormData>({
    resolver: zodResolver(urlFormSchema),
    defaultValues: {
      url: '',
    },
    mode: 'onSubmit', // Only validate on submit to avoid premature errors
  });

  // Watch the URL field for debouncing
  const urlValue = form.watch('url');
  const debouncedUrl = useDebounce(
    urlValue,
    webContentAnalyzerConfig.performance.urlInputDebounceMs
  );

  // Debounced URL validation effect
  useEffect(() => {
    if (debouncedUrl && debouncedUrl !== urlValue) {
      // Trigger validation when debounced value changes
      form.trigger('url');
    }
  }, [debouncedUrl, urlValue, form]);

  const handleSubmit = (data: UrlFormData) => {
    onSubmit(data.url ?? '', modelProvider);
  };

  const handleFormSubmit = form.handleSubmit(handleSubmit);

  const isFormDisabled = isLoading || disabled;

  return (
    <>
      <div className="w-full max-w-2xl mx-auto">
        {/* Model Provider Selection (for mobile/smaller screens, optional) */}
        <div className="flex justify-end items-center mb-4">
          <Select
            value={modelProvider}
            onValueChange={setModelProvider}
            disabled={isLoading || disabled}
          >
            <SelectTrigger id="model-provider-select-form" className="w-40">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openrouter">OpenRouter</SelectItem>
              <SelectItem value="openai">OpenAI GPT-4o</SelectItem>
              <SelectItem value="gemini">Google Gemini</SelectItem>
              <SelectItem value="deepseek">DeepSeek R1</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Form {...form}>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="relative">
                      <LinkIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground size-4" />
                      <Input
                        {...field}
                        type="url"
                        placeholder="https://example.com"
                        disabled={isFormDisabled}
                        className="pl-10"
                        autoComplete="url"
                        autoFocus
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!mounted ? (
              // Show loading state during hydration to prevent mismatch
              <Button type="button" disabled className="w-full" size="lg">
                <Loader2Icon className="size-4 animate-spin" />
                <span>Loading...</span>
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={isFormDisabled || !urlValue?.trim()}
                className="w-full"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <SparklesIcon className="size-4" />
                    <span>Analyze Website</span>
                  </>
                )}
              </Button>
            )}
          </form>
        </Form>
      </div>
    </>
  );
}
