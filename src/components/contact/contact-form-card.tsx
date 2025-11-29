'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { sendMessageAction } from '@/actions/send-message';
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
import { Textarea } from '@/components/ui/textarea';
import { clientLogger } from '@/lib/client-logger';
import {
  type EnvelopeWithDomainError,
  unwrapEnvelopeOrThrowDomainError,
} from '@/lib/domain-error-utils';

type Envelope<T> = EnvelopeWithDomainError<T>;

/**
 * Contact form card component
 * This is a client component that handles the contact form submission
 */
export function ContactFormCard() {
  const t = useTranslations('ContactPage.form');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>('');

  // Create a schema for contact form validation
  const formSchema = z.object({
    name: z.string().min(3, t('nameMinLength')).max(30, t('nameMaxLength')),
    email: z.email(t('emailValidation')),
    message: z
      .string()
      .min(10, t('messageMinLength'))
      .max(500, t('messageMaxLength')),
  });

  // Form types
  type ContactFormValues = z.infer<typeof formSchema>;

  // Initialize the form
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      message: '',
    },
  });

  // Handle form submission
  const onSubmit = (values: ContactFormValues) => {
    startTransition(async () => {
      try {
        setError('');

        const result = await sendMessageAction(values);
        unwrapEnvelopeOrThrowDomainError<{ success: true }>(
          result?.data as Envelope<{ success: true }> | undefined,
          {
            defaultErrorMessage: t('fail'),
          }
        );

        toast.success(t('success'));
        form.reset();
      } catch (err) {
        clientLogger.error('Form submission error:', err);
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col">
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('name')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('name')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('message')}</FormLabel>
                  <FormControl>
                    <Textarea placeholder={t('message')} rows={3} {...field} />
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
              {isPending ? t('submitting') : t('submit')}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
