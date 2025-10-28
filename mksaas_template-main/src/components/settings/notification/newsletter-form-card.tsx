'use client';

import { FormError } from '@/components/shared/form-error';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { websiteConfig } from '@/config/website';
import {
  useNewsletterStatus,
  useSubscribeNewsletter,
  useUnsubscribeNewsletter,
} from '@/hooks/use-newsletter';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

interface NewsletterFormCardProps {
  className?: string;
}

/**
 * Newsletter subscription form card
 *
 * Allows users to toggle their newsletter subscription status
 */
export function NewsletterFormCard({ className }: NewsletterFormCardProps) {
  // show nothing if newsletter is disabled
  if (!websiteConfig.newsletter.enable) {
    return null;
  }

  const t = useTranslations('Dashboard.settings.notification');
  const { data: session } = authClient.useSession();
  const currentUser = session?.user;

  // TanStack Query hooks
  const {
    data: newsletterStatus,
    isLoading: isStatusLoading,
    error: statusError,
  } = useNewsletterStatus(currentUser?.email);

  const subscribeMutation = useSubscribeNewsletter();
  const unsubscribeMutation = useUnsubscribeNewsletter();

  // Create a schema for newsletter subscription
  const formSchema = z.object({
    subscribed: z.boolean(),
  });

  // Initialize the form
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      subscribed: false,
    },
  });

  // Update form when newsletter status changes
  useEffect(() => {
    if (newsletterStatus) {
      form.setValue('subscribed', newsletterStatus.subscribed);
    }
  }, [newsletterStatus, form]);

  // Check if user exists after all hooks are initialized
  if (!currentUser) {
    return null;
  }

  // Handle checkbox change
  const handleSubscriptionChange = async (value: boolean) => {
    if (!currentUser.email) {
      toast.error(t('newsletter.emailRequired'));
      return;
    }

    try {
      if (value) {
        // Subscribe to newsletter
        await subscribeMutation.mutateAsync(currentUser.email);
        toast.success(t('newsletter.subscribeSuccess'));
      } else {
        // Unsubscribe from newsletter
        await unsubscribeMutation.mutateAsync(currentUser.email);
        toast.success(t('newsletter.unsubscribeSuccess'));
      }
    } catch (error) {
      console.error('newsletter subscription error:', error);
      const errorMessage =
        error instanceof Error ? error.message : t('newsletter.error');
      toast.error(errorMessage);
      // Reset form to previous state on error
      form.setValue('subscribed', newsletterStatus?.subscribed || false);
    }
  };

  return (
    <Card className={cn('w-full overflow-hidden pt-6 pb-0', className)}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          {t('newsletter.title')}
        </CardTitle>
        <CardDescription>{t('newsletter.description')}</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="subscribed"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      {t('newsletter.label')}
                    </FormLabel>
                  </div>
                  <FormControl>
                    <div className="relative flex items-center">
                      {(isStatusLoading ||
                        subscribeMutation.isPending ||
                        unsubscribeMutation.isPending) && (
                        <Loader2Icon className="mr-2 size-4 animate-spin text-primary" />
                      )}
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          handleSubscriptionChange(checked);
                        }}
                        disabled={
                          isStatusLoading ||
                          subscribeMutation.isPending ||
                          unsubscribeMutation.isPending
                        }
                        aria-readonly={
                          isStatusLoading ||
                          subscribeMutation.isPending ||
                          unsubscribeMutation.isPending
                        }
                        className="cursor-pointer"
                      />
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />
            <FormError
              message={
                statusError?.message ||
                subscribeMutation.error?.message ||
                unsubscribeMutation.error?.message
              }
            />
          </CardContent>
          <CardFooter className="mt-6 px-6 py-4 bg-muted rounded-none">
            <p className="text-sm text-muted-foreground">
              {t('newsletter.hint')}
            </p>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
