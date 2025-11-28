'use client';

import { RootProvider } from 'fumadocs-ui/provider/next';
import { ThemeProvider, useTheme } from 'next-themes';
import type { ReactNode } from 'react';
import { ActiveThemeProvider } from '@/components/layout/active-theme-provider';
import { QueryProvider } from '@/components/providers/query-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { websiteConfig } from '@/config/website';
import { type DocsLocale, getDocsUiI18n } from '@/lib/docs/ui-i18n';

interface ProvidersProps {
  children: ReactNode;
  locale: DocsLocale;
}

/**
 * Providers
 *
 * This component is used to wrap the app in the providers.
 *
 * - ThemeProvider: Provides the theme to the app.
 * - ActiveThemeProvider: Provides the active theme to the app.
 * - RootProvider: Provides the root provider for Fumadocs UI.
 * - TooltipProvider: Provides the tooltip to the app.
 * - PaymentProvider: Provides the payment state to the app.
 * - CreditsProvider: Provides the credits state to the app.
 */
export function Providers({ children, locale }: ProvidersProps) {
  const theme = useTheme();
  const defaultMode = websiteConfig.ui.mode?.defaultMode ?? 'system';

  return (
    <QueryProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme={defaultMode}
        enableSystem={true}
        disableTransitionOnChange
      >
        <ActiveThemeProvider>
          <RootProvider theme={theme} i18n={getDocsUiI18n(locale)}>
            <TooltipProvider>{children}</TooltipProvider>
          </RootProvider>
        </ActiveThemeProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}
