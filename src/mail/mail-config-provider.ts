import { websiteConfig } from '@/config/website';
import type { MailConfig } from '@/types';

/**
 * Mail 配置 Provider 抽象
 *
 * - 负责集中提供邮件相关的配置（provider/fromEmail/supportEmail 等）；
 * - 目前仅直接返回 `websiteConfig.mail`，校验逻辑由调用方决定；
 * - 未来如需按 workspace/tenant 调整配置，可在此处扩展而不影响调用方。
 */
export interface MailConfigProvider {
  getMailConfig(): MailConfig;
}

class DefaultMailConfigProvider implements MailConfigProvider {
  getMailConfig(): MailConfig {
    return websiteConfig.mail;
  }
}

export const mailConfigProvider: MailConfigProvider =
  new DefaultMailConfigProvider();
