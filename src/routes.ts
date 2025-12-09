import { websiteConfig } from './config/website';

/**
 * The routes for the application
 */
export enum Routes {
  Root = '/',

  // marketing pages
  FAQ = '/#faq',
  Features = '/#features',
  Pricing = '/pricing', // change to /#pricing if you want to use the pricing section in homepage
  Blog = '/blog',
  Docs = '/docs',
  About = '/about',
  Contact = '/contact',
  Waitlist = '/waitlist',
  Changelog = '/changelog',
  CookiePolicy = '/cookie',
  PrivacyPolicy = '/privacy',
  TermsOfService = '/terms',

  // auth routes
  Login = '/auth/login',
  Register = '/auth/register',
  AuthError = '/auth/error',
  ForgotPassword = '/auth/forgot-password',
  ResetPassword = '/auth/reset-password',

  // dashboard routes
  Dashboard = '/dashboard',
  AdminUsers = '/admin/users',
  SettingsProfile = '/settings/profile',
  SettingsBilling = '/settings/billing',
  SettingsCredits = '/settings/credits',
  SettingsSecurity = '/settings/security',
  SettingsNotifications = '/settings/notifications',

  // AI routes
  AIText = '/ai/text',
  AIImage = '/ai/image',
  AIChat = '/ai/chat',
  AIVideo = '/ai/video',
  AIAudio = '/ai/audio',

  // block routes
  MagicuiBlocks = '/magicui',
  HeroBlocks = '/blocks/hero-section',
  LogoCloudBlocks = '/blocks/logo-cloud',
  FeaturesBlocks = '/blocks/features',
  IntegrationsBlocks = '/blocks/integrations',
  ContentBlocks = '/blocks/content',
  StatsBlocks = '/blocks/stats',
  TeamBlocks = '/blocks/team',
  TestimonialsBlocks = '/blocks/testimonials',
  CallToActionBlocks = '/blocks/call-to-action',
  FooterBlocks = '/blocks/footer',
  PricingBlocks = '/blocks/pricing',
  ComparatorBlocks = '/blocks/comparator',
  FAQBlocks = '/blocks/faqs',
  LoginBlocks = '/blocks/login',
  SignupBlocks = '/blocks/sign-up',
  ForgotPasswordBlocks = '/blocks/forgot-password',
  ContactBlocks = '/blocks/contact',
}

type RouteMeta = {
  protected?: boolean;
  disallowedWhenLoggedIn?: boolean;
};

const routeMeta: Record<Routes, RouteMeta> = {
  [Routes.Root]: {},

  // marketing pages
  [Routes.FAQ]: {},
  [Routes.Features]: {},
  [Routes.Pricing]: {},
  [Routes.Blog]: {},
  [Routes.Docs]: {},
  [Routes.About]: {},
  [Routes.Contact]: {},
  [Routes.Waitlist]: {},
  [Routes.Changelog]: {},
  [Routes.CookiePolicy]: {},
  [Routes.PrivacyPolicy]: {},
  [Routes.TermsOfService]: {},

  // auth routes
  [Routes.Login]: { disallowedWhenLoggedIn: true },
  [Routes.Register]: { disallowedWhenLoggedIn: true },
  [Routes.AuthError]: {},
  [Routes.ForgotPassword]: { disallowedWhenLoggedIn: true },
  [Routes.ResetPassword]: { disallowedWhenLoggedIn: true },

  // dashboard routes
  [Routes.Dashboard]: { protected: true },
  [Routes.AdminUsers]: { protected: true },
  [Routes.SettingsProfile]: { protected: true },
  [Routes.SettingsBilling]: { protected: true },
  [Routes.SettingsCredits]: { protected: true },
  [Routes.SettingsSecurity]: { protected: true },
  [Routes.SettingsNotifications]: { protected: true },

  // AI routes
  [Routes.AIText]: { protected: true },
  [Routes.AIImage]: { protected: true },
  [Routes.AIChat]: { protected: true },
  [Routes.AIVideo]: { protected: true },
  [Routes.AIAudio]: { protected: true },

  // block routes (public marketing)
  [Routes.MagicuiBlocks]: {},
  [Routes.HeroBlocks]: {},
  [Routes.LogoCloudBlocks]: {},
  [Routes.FeaturesBlocks]: {},
  [Routes.IntegrationsBlocks]: {},
  [Routes.ContentBlocks]: {},
  [Routes.StatsBlocks]: {},
  [Routes.TeamBlocks]: {},
  [Routes.TestimonialsBlocks]: {},
  [Routes.CallToActionBlocks]: {},
  [Routes.FooterBlocks]: {},
  [Routes.PricingBlocks]: {},
  [Routes.ComparatorBlocks]: {},
  [Routes.FAQBlocks]: {},
  [Routes.LoginBlocks]: {},
  [Routes.SignupBlocks]: {},
  [Routes.ForgotPasswordBlocks]: {},
  [Routes.ContactBlocks]: {},
};

const allRoutes = Object.values(Routes);

/**
 * The routes that can not be accessed by logged in users
 */
export const routesNotAllowedByLoggedInUsers: ReadonlyArray<Routes> =
  allRoutes.filter((route) => routeMeta[route]?.disallowedWhenLoggedIn);

/**
 * The routes that are protected and require authentication
 */
export const protectedRoutes: ReadonlyArray<Routes> = allRoutes.filter(
  (route) => routeMeta[route]?.protected
);

export const isProtectedRoute = (route: string): route is Routes => {
  return protectedRoutes.includes(route as Routes);
};

/**
 * The default redirect path after logging in
 */
export const DEFAULT_LOGIN_REDIRECT =
  websiteConfig.routes.defaultLoginRedirect ?? Routes.Dashboard;
