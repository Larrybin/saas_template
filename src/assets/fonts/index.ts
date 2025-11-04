import localFont from 'next/font/local';

/**
 * 1. Fonts Documentation
 * https://mksaas.com/docs/fonts
 *
 * 2. Fonts are self-hosted to keep Next.js builds deterministic.
 *    Store new files under ./files and register them below.
 */
export const fontNotoSans = localFont({
  variable: '--font-noto-sans',
  display: 'swap',
  src: [
    { path: './files/noto-sans-500.ttf', weight: '500', style: 'normal' },
    { path: './files/noto-sans-600.ttf', weight: '600', style: 'normal' },
    { path: './files/noto-sans-700.ttf', weight: '700', style: 'normal' },
  ],
});

export const fontNotoSerif = localFont({
  variable: '--font-noto-serif',
  display: 'swap',
  src: [{ path: './files/noto-serif-400.ttf', weight: '400', style: 'normal' }],
});

export const fontNotoSansMono = localFont({
  variable: '--font-noto-sans-mono',
  display: 'swap',
  src: [
    {
      path: './files/noto-sans-mono-400.ttf',
      weight: '400',
      style: 'normal',
    },
  ],
});

export const fontBricolageGrotesque = localFont({
  variable: '--font-bricolage-grotesque',
  display: 'swap',
  src: [
    { path: './files/bricolage-400.ttf', weight: '400', style: 'normal' },
    { path: './files/bricolage-500.ttf', weight: '500', style: 'normal' },
    { path: './files/bricolage-600.ttf', weight: '600', style: 'normal' },
    { path: './files/bricolage-700.ttf', weight: '700', style: 'normal' },
  ],
});
