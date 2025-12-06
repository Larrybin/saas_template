import type { ReactNode } from "react";
import type { PricePlan } from "@/payment/types";
import type { CreditPackage } from "@/credits/types";

/**
 * website config, without translations
 */
export type WebsiteConfig = {
	ui: UiConfig;
	metadata: MetadataConfig;
	features: FeaturesConfig;
	routes: RoutesConfig;
	analytics: AnalyticsConfig;
	ai?: AiConfig;
	auth: AuthConfig;
	i18n: I18nConfig;
	blog: BlogConfig;
	docs: DocsConfig;
	mail: MailConfig;
	newsletter: NewsletterConfig;
	storage: StorageConfig;
	payment: PaymentConfig;
	price: PriceConfig;
	credits: CreditsConfig;
};

/**
 * UI configuration
 */
export interface UiConfig {
	mode?: ModeConfig;
	theme?: ThemeConfig;
}

/**
 * Website metadata
 */
export interface MetadataConfig {
	images?: ImagesConfig;
	social?: SocialConfig;
}

export interface ModeConfig {
	defaultMode?: "light" | "dark" | "system"; // The default mode of the website
	enableSwitch?: boolean; // Whether to enable the mode switch
}

export interface ThemeConfig {
	defaultTheme?: "default" | "blue" | "green" | "amber" | "neutral"; // The default theme of the website
	enableSwitch?: boolean; // Whether to enable the theme switch
}

export interface ImagesConfig {
	ogImage?: string; // The image as Open Graph image
	logoLight?: string; // The light logo image
	logoDark?: string; // The dark logo image
}

/**
 * Social media configuration
 */
export interface SocialConfig {
	twitter?: string;
	github?: string;
	discord?: string;
	blueSky?: string;
	mastodon?: string;
	youtube?: string;
	linkedin?: string;
	facebook?: string;
	instagram?: string;
	tiktok?: string;
	telegram?: string;
}

/**
 * Website features
 */
export interface FeaturesConfig {
	enableCrispChat?: boolean; // Whether to enable the crisp chat
	enableUpgradeCard?: boolean; // Whether to enable the upgrade card in the sidebar
	enableUpdateAvatar?: boolean; // Whether to enable the update avatar in settings
	enableAffonsoAffiliate?: boolean; // Whether to enable affonso affiliate
	enablePromotekitAffiliate?: boolean; // Whether to enable promotekit affiliate
	enableDatafastRevenueTrack?: boolean; // Whether to enable datafast revenue tracking
	enableTurnstileCaptcha?: boolean; // Whether to enable turnstile captcha
}

/**
 * Routes configuration
 */
export interface RoutesConfig {
	defaultLoginRedirect?: string; // The default login redirect route
}

/**
 * Analytics configuration
 */
export interface AnalyticsConfig {
	enableVercelAnalytics?: boolean; // Whether to enable vercel analytics
	enableSpeedInsights?: boolean; // Whether to enable speed insights
}

/**
 * AI configuration
 */
export interface AiConfig {
	billing?: AiBillingConfig;
}

export interface AiBillingConfig {
	chat?: AiBillingRuleConfig;
	analyzeContent?: AiBillingRuleConfig;
	generateImage?: AiBillingRuleConfig;
}

export interface AiBillingRuleOverrideConfig {
	/**
	 * 针对特定订阅/价格计划的覆盖（如 free/basic/pro 等）。
	 * 若省略，则对所有 plan 生效。
	 */
	planId?: string;
	/**
	 * 针对特定 region 的覆盖（如 us/eu/apac 等）。
	 * 若省略，则对所有 region 生效。
	 */
	region?: string;
	enabled?: boolean;
	creditsPerCall?: number;
	freeCallsPerPeriod?: number;
}

export interface AiBillingRuleConfig {
	enabled?: boolean;
	creditsPerCall?: number;
	freeCallsPerPeriod?: number;
	/**
	 * 可选的按 plan/region 细分的规则覆盖。
	 * DefaultAiBillingPolicy 会根据调用上下文中的 planId/region
	 * 选择最匹配的条目，并在此基础上覆盖顶层规则。
	 */
	rules?: AiBillingRuleOverrideConfig[];
}

export interface AuthConfig {
	enableGoogleLogin?: boolean; // Whether to enable google login
	enableGithubLogin?: boolean; // Whether to enable github login
	enableCredentialLogin?: boolean; // Whether to enable email/password login
}

/**
 * I18n configuration
 */
export interface I18nConfig {
	defaultLocale: string; // The default locale of the website
	locales: Record<string, { flag?: string; name: string }>; // The locales of the website
}

/**
 * Blog configuration
 */
export interface BlogConfig {
	enable: boolean; // Whether to enable the blog
	paginationSize: number; // Number of posts per page
	relatedPostsSize: number; // Number of related posts to show
}

/**
 * Docs configuration
 */
export interface DocsConfig {
	enable: boolean; // Whether to enable the docs
}

/**
 * Mail configuration
 */
export interface MailConfig {
	provider: "resend"; // The email provider, only resend is supported for now
	fromEmail?: string; // The email address to send from
	supportEmail?: string; // The email address to send support emails to
}

/**
 * Newsletter configuration
 */
export interface NewsletterConfig {
	enable: boolean; // Whether to enable the newsletter
	provider: "resend"; // The newsletter provider, only resend is supported for now
	autoSubscribeAfterSignUp?: boolean; // Whether to automatically subscribe users to the newsletter after sign up
}

/**
 * Storage configuration
 */
export interface StorageConfig {
	enable: boolean; // Whether to enable the storage
	provider: "s3"; // The storage provider, only s3 is supported for now
	allowedFolders?: string[]; // Optional allowlist for upload folder roots
}

/**
 * Payment configuration
 */
export interface CreemSubscriptionProductConfig {
	productId: string;
	priceId?: string;
}

export interface CreemCreditProductConfig {
	productId: string;
	priceId?: string;
}

export interface CreemPaymentConfig {
	/**
	 * 订阅类商品映射：planId -> priceId -> Creem 产品
	 */
	subscriptionProducts?: Record<string, Record<string, CreemSubscriptionProductConfig>>;
	/**
	 * 积分包映射：packageId -> Creem 产品
	 */
	creditProducts?: Record<string, CreemCreditProductConfig>;
}

export interface PaymentConfig {
	/**
	 * 支付 Provider 标识
	 *
	 * - 生产环境：必须配置为 "stripe"；
	 * - 非生产环境：可配置为 "creem" 以启用 CreemPaymentProvider，用于 Phase A 开发与测试。
	 *   实际运行时行为仍受 DefaultPaymentProviderFactory Phase Gate 约束。
	 */
	provider: "stripe" | "creem";
	/**
	 * Creem 专用配置（plan/price/package → Creem product/price 映射等）。
	 * 在未启用 Creem 时可以省略。
	 */
	creem?: CreemPaymentConfig;
}

/**
 * Price configuration
 */
export interface PriceConfig {
	plans: Record<string, PricePlan>; // Plans indexed by ID
}

/**
 * Credits configuration
 */
export interface CreditsConfig {
	enableCredits: boolean; // Whether to enable credits
	enablePackagesForFreePlan: boolean; // Whether to enable purchase credits for free plan users
	registerGiftCredits: {
		enable: boolean; // Whether to enable register gift credits
		amount: number; // The amount of credits to give to the user
		expireDays?: number; // The number of days to expire the credits, undefined means no expire
	};
	packages: Record<string, CreditPackage>; // Packages indexed by ID
}

/**
 * menu item, used for navbar links, sidebar links, footer links
 */
export type MenuItem = {
	title: string; // The text to display
	description?: string; // The description of the item
	icon?: ReactNode; // The icon to display
	href?: string; // The url to link to
	external?: boolean; // Whether the link is external
	authorizeOnly?: string[]; // The roles that are authorized to see the item
};

/**
 * nested menu item, used for navbar links, sidebar links, footer links
 */
export type NestedMenuItem = MenuItem & {
	items?: MenuItem[]; // The items to display in the nested menu
};

/**
 * Blog Category
 *
 * we can not pass CategoryType from server component to client component
 * so we need to define a new type, and use it in the client component
 */
export type BlogCategory = {
	slug: string;
	name: string;
	description: string;
};
