declare module '@creem_io/better-auth' {
  // 最小化类型定义，仅覆盖当前项目实际用到的 API。
  export interface CreemPluginOptions {
    apiKey: string;
    webhookSecret?: string | undefined;
    persistSubscriptions?: boolean;
    testMode?: boolean;
  }

  // 返回值实际是 BetterAuth 插件，这里用 any 兜底即可满足类型检查。
  export function creem(options: CreemPluginOptions): unknown;
}

declare module '@creem_io/better-auth/server' {
  // 与当前使用场景对齐的最小返回结构。
  export interface CreemSubscriptionStatus {
    hasAccess: boolean;
  }

  export interface CreemServerConfig {
    apiKey: string;
    testMode?: boolean;
  }

  export interface CreemServerContext {
    database: unknown;
    userId: string;
  }

  export function checkSubscriptionAccess(
    config: CreemServerConfig,
    context: CreemServerContext
  ): Promise<CreemSubscriptionStatus | undefined>;
}
