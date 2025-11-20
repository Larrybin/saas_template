'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import { websiteConfig } from '@/config/website';

const COOKIE_NAME = 'active_theme';
const DEFAULT_THEME = websiteConfig.ui.theme?.defaultTheme ?? 'default';

function setThemeCookie(theme: string) {
  if (typeof window === 'undefined') return;

  const cookieStore = (
    window as Window & {
      cookieStore?: {
        set: (options: unknown) => Promise<void>;
      };
    }
  ).cookieStore;

  if (cookieStore && typeof cookieStore.set === 'function') {
    void cookieStore.set({
      name: COOKIE_NAME,
      value: theme,
      path: '/',
      maxAge: 31536000,
      sameSite: 'lax',
      secure: window.location.protocol === 'https:',
    });
    return;
  }

  // biome-ignore lint/suspicious/noDocumentCookie: Fallback for browsers without Cookie Store API
  document.cookie = `${COOKIE_NAME}=${theme}; path=/; max-age=31536000; SameSite=Lax; ${
    window.location.protocol === 'https:' ? 'Secure;' : ''
  }`;
}

type ThemeContextType = {
  activeTheme: string;
  setActiveTheme: (theme: string) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * This component is used to provide the active theme to the application
 * It also sets the theme cookie and updates the body class when the theme changes.
 *
 * NOTICE: Since custom theme is set in useEffect,
 * it will not be applied until the component is mounted,
 * for better user experience, we recommend to replace the
 * default theme with the custom theme in global.css.
 *
 * docs:
 * https://mksaas.com/docs/themes
 */
export function ActiveThemeProvider({
  children,
  initialTheme,
}: {
  children: ReactNode;
  initialTheme?: string;
}) {
  const [activeTheme, setActiveTheme] = useState<string>(
    () => initialTheme || DEFAULT_THEME
  );

  useEffect(() => {
    setThemeCookie(activeTheme);

    Array.from(document.body.classList)
      .filter((className) => className.startsWith('theme-'))
      .forEach((className) => {
        document.body.classList.remove(className);
      });
    document.body.classList.add(`theme-${activeTheme}`);
  }, [activeTheme]);

  return (
    <ThemeContext.Provider value={{ activeTheme, setActiveTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeConfig() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error(
      'useThemeConfig must be used within an ActiveThemeProvider'
    );
  }
  return context;
}
