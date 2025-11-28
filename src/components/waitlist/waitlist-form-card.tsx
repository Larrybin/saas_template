'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { subscribeNewsletterAction } from '@/actions/subscribe-newsletter';
import { FormError } from '@/components/shared/form-error';
import { Button } from '@/components/ui/button';
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
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { clientLogger } from '@/lib/client-logger';
import {
  type EnvelopeWithDomainError,
  unwrapEnvelopeOrThrowDomainError,
} from '@/lib/domain-error-utils';

type Envelope<T> = EnvelopeWithDomainError<T>;

/**
 * Waitlist form card component
 * This is a client component that handles the waitlist form submission
 */
export function WaitlistFormCard() {
  const t = useTranslations('WaitlistPage.form');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>('');

  // Create a schema for waitlist form validation
  const formSchema = z.object({
    email: z.email({ message: t('emailValidation') }),
  });

  // Initialize the form
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
    },
  });

  // Handle form submission
  const onSubmit = (values: z.infer<typeof formSchema>) => {
    startTransition(async () => {
      try {
        setError('');

        const result = await subscribeNewsletterAction({
          email: values.email,
        });

        unwrapEnvelopeOrThrowDomainError<{ success: true }>(
          result?.data as Envelope<{ success: true }> | undefined,
          {
            defaultErrorMessage: t('fail'),
          }
        );

        toast.success(t('success'));
        form.reset();
      } catch (err) {
        clientLogger.error('Waitlist form submission error:', err);
        const errorMessage =
          err instanceof Error && err.message ? err.message : t('fail');
        setError(errorMessage);
        toast.error(errorMessage);
      }
    });
  };

  return (
    <Card className="mx-auto max-w-lg overflow-hidden pt-6 pb-0">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('email')}</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder={t('email')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormError message={error} />
          </CardContent>
          <CardFooter className="mt-6 px-6 py-4 flex justify-between items-center bg-muted rounded-none">
            <Button
              type="submit"
              disabled={isPending}
              className="cursor-pointer"
            >
              {isPending ? t('subscribing') : t('subscribe')}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
