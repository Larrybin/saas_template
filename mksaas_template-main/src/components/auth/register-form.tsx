'use client';

import { validateCaptchaAction } from '@/actions/validate-captcha';
import { AuthCard } from '@/components/auth/auth-card';
import { FormError } from '@/components/shared/form-error';
import { FormSuccess } from '@/components/shared/form-success';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { websiteConfig } from '@/config/website';
import { authClient } from '@/lib/auth-client';
import { getUrlWithLocaleInCallbackUrl } from '@/lib/urls/urls';
import { DEFAULT_LOGIN_REDIRECT, Routes } from '@/routes';
import { zodResolver } from '@hookform/resolvers/zod';
import { EyeIcon, EyeOffIcon, Loader2Icon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';
import { Captcha } from '../shared/captcha';
import { SocialLoginButton } from './social-login-button';

interface RegisterFormProps {
  callbackUrl?: string;
}

export const RegisterForm = ({
  callbackUrl: propCallbackUrl,
}: RegisterFormProps) => {
  const t = useTranslations('AuthPage.register');
  const searchParams = useSearchParams();
  const paramCallbackUrl = searchParams.get('callbackUrl');
  // Use prop callback URL or param callback URL if provided, otherwise use the default login redirect
  const locale = useLocale();
  const defaultCallbackUrl = getUrlWithLocaleInCallbackUrl(
    DEFAULT_LOGIN_REDIRECT,
    locale
  );
  const callbackUrl = propCallbackUrl || paramCallbackUrl || defaultCallbackUrl;
  console.log('register form, callbackUrl', callbackUrl);

  const [error, setError] = useState<string | undefined>('');
  const [success, setSuccess] = useState<string | undefined>('');
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const captchaRef = useRef<any>(null);

  // Check if credential login is enabled
  const credentialLoginEnabled = websiteConfig.auth.enableCredentialLogin;

  // turnstile captcha schema
  const turnstileEnabled = websiteConfig.features.enableTurnstileCaptcha;
  const captchaSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const captchaConfigured = turnstileEnabled && !!captchaSiteKey;
  const captchaSchema = captchaConfigured
    ? z.string().min(1, 'Please complete the captcha')
    : z.string().optional();

  const RegisterSchema = z.object({
    email: z.email({
      message: t('emailRequired'),
    }),
    password: z.string().min(1, {
      message: t('passwordRequired'),
    }),
    name: z.string().min(1, {
      message: t('nameRequired'),
    }),
    captchaToken: captchaSchema,
  });

  const form = useForm<z.infer<typeof RegisterSchema>>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: {
      email: '',
      password: '',
      name: '',
      captchaToken: '',
    },
  });

  const captchaToken = useWatch({
    control: form.control,
    name: 'captchaToken',
  });

  // Function to reset captcha
  const resetCaptcha = () => {
    form.setValue('captchaToken', '');
    // Try to reset the Turnstile widget if available
    if (captchaRef.current && typeof captchaRef.current.reset === 'function') {
      captchaRef.current.reset();
    }
  };

  const onSubmit = async (values: z.infer<typeof RegisterSchema>) => {
    // Validate captcha token if turnstile is enabled and site key is available
    if (captchaConfigured && values.captchaToken) {
      setIsPending(true);
      setError('');
      setSuccess('');

      const captchaResult = await validateCaptchaAction({
        captchaToken: values.captchaToken,
      });

      if (!captchaResult?.data?.success || !captchaResult?.data?.valid) {
        console.error('register, captcha invalid:', values.captchaToken);
        const errorMessage = captchaResult?.data?.error || t('captchaInvalid');
        setError(errorMessage);
        setIsPending(false);
        resetCaptcha(); // Reset captcha on validation failure
        return;
      }
    }

    // 1. if requireEmailVerification is true, callbackURL will be used in the verification email,
    // the user will be redirected to the callbackURL after the email is verified.
    // 2. if requireEmailVerification is false, the user will not be redirected to the callbackURL,
    // we should redirect to the callbackURL manually in the onSuccess callback.
    await authClient.signUp.email(
      {
        email: values.email,
        password: values.password,
        name: values.name,
        callbackURL: callbackUrl,
      },
      {
        onRequest: (ctx) => {
          // console.log('register, request:', ctx.url);
          setIsPending(true);
          setError('');
          setSuccess('');
        },
        onResponse: (ctx) => {
          // console.log('register, response:', ctx.response);
          setIsPending(false);
        },
        onSuccess: (ctx) => {
          // sign up success, user information stored in ctx.data
          // console.log("register, success:", ctx.data);
          setSuccess(t('checkEmail'));

          // add affonso affiliate
          // https://affonso.io/app/affiliate-program/connect
          if (websiteConfig.features.enableAffonsoAffiliate) {
            console.log('register, affonso affiliate:', values.email);
            window.Affonso.signup(values.email);
          }
        },
        onError: (ctx) => {
          // sign up fail, display the error message
          console.error('register, error:', ctx.error);
          setError(`${ctx.error.status}: ${ctx.error.message}`);
          // Reset captcha on registration error
          if (captchaConfigured) {
            resetCaptcha();
          }
        },
      }
    );
  };

  const togglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  return (
    <AuthCard
      headerLabel={t('createAccount')}
      bottomButtonLabel={t('signInHint')}
      bottomButtonHref={`${Routes.Login}`}
    >
      {credentialLoginEnabled && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('name')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={isPending}
                        placeholder="name"
                      />
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
                      <Input
                        {...field}
                        disabled={isPending}
                        placeholder="name@example.com"
                        type="email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('password')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          disabled={isPending}
                          placeholder="******"
                          type={showPassword ? 'text' : 'password'}
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={togglePasswordVisibility}
                          disabled={isPending}
                        >
                          {showPassword ? (
                            <EyeOffIcon className="size-4 text-muted-foreground" />
                          ) : (
                            <EyeIcon className="size-4 text-muted-foreground" />
                          )}
                          <span className="sr-only">
                            {showPassword
                              ? t('hidePassword')
                              : t('showPassword')}
                          </span>
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormError message={error} />
            <FormSuccess message={success} />
            {captchaConfigured && (
              <Captcha
                ref={captchaRef}
                onSuccess={(token) => form.setValue('captchaToken', token)}
                validationError={form.formState.errors.captchaToken?.message}
              />
            )}
            <Button
              disabled={isPending || (captchaConfigured && !captchaToken)}
              size="lg"
              type="submit"
              className="cursor-pointer w-full flex items-center justify-center gap-2"
            >
              {isPending && (
                <Loader2Icon className="mr-2 size-4 animate-spin" />
              )}
              <span>{t('signUp')}</span>
            </Button>
          </form>
        </Form>
      )}
      <div className="mt-4">
        <SocialLoginButton
          callbackUrl={callbackUrl}
          showDivider={credentialLoginEnabled}
        />
      </div>
    </AuthCard>
  );
};
