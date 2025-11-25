import { z } from 'zod';
import { maskEnvSnapshot, pickEnv } from './utils';

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const booleanString = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? true : value === 'true'));

const optionalBooleanString = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value ? value === 'true' : undefined));

const telemetryString = z
  .enum(['0', '1', 'true', 'false'] as const)
  .default('1');

const serverSchemaInput = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  BETTER_AUTH_SECRET: z.string().min(1, 'BETTER_AUTH_SECRET is required'),
  NEXT_TELEMETRY_DISABLED: telemetryString,
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  RESEND_API_KEY: optionalString,
  RESEND_AUDIENCE_ID: optionalString,
  STORAGE_REGION: optionalString,
  STORAGE_ENDPOINT: optionalString,
  STORAGE_ACCESS_KEY_ID: optionalString,
  STORAGE_SECRET_ACCESS_KEY: optionalString,
  STORAGE_BUCKET_NAME: optionalString,
  STORAGE_PUBLIC_URL: optionalString,
  STORAGE_FORCE_PATH_STYLE: booleanString,
  TURNSTILE_SECRET_KEY: optionalString,
  DISCORD_WEBHOOK_URL: optionalString,
  FEISHU_WEBHOOK_URL: optionalString,
  CRON_JOBS_USERNAME: optionalString,
  CRON_JOBS_PASSWORD: optionalString,
  FAL_API_KEY: optionalString,
  FIRECRAWL_API_KEY: optionalString,
  FIREWORKS_API_KEY: optionalString,
  OPENAI_API_KEY: optionalString,
  REPLICATE_API_TOKEN: optionalString,
  GOOGLE_GENERATIVE_AI_API_KEY: optionalString,
  DEEPSEEK_API_KEY: optionalString,
  OPENROUTER_API_KEY: optionalString,
  AI_GATEWAY_API_KEY: optionalString,
  GITHUB_CLIENT_ID: optionalString,
  GITHUB_CLIENT_SECRET: optionalString,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  UPSTASH_REDIS_REST_URL: optionalString,
  UPSTASH_REDIS_REST_TOKEN: optionalString,
  RATE_LIMIT_REQUIRE_REDIS: optionalBooleanString,
});

const serverSchema = serverSchemaInput.transform((value) => ({
  databaseUrl: value.DATABASE_URL,
  betterAuthSecret: value.BETTER_AUTH_SECRET,
  telemetry: {
    disabled:
      value.NEXT_TELEMETRY_DISABLED === '1' ||
      value.NEXT_TELEMETRY_DISABLED === 'true',
  },
  stripeSecretKey: value.STRIPE_SECRET_KEY,
  stripeWebhookSecret: value.STRIPE_WEBHOOK_SECRET,
  resendApiKey: value.RESEND_API_KEY,
  resendAudienceId: value.RESEND_AUDIENCE_ID,
  storage: {
    region: value.STORAGE_REGION,
    endpoint: value.STORAGE_ENDPOINT,
    accessKeyId: value.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: value.STORAGE_SECRET_ACCESS_KEY,
    bucketName: value.STORAGE_BUCKET_NAME,
    publicUrl: value.STORAGE_PUBLIC_URL,
    forcePathStyle: value.STORAGE_FORCE_PATH_STYLE,
  },
  turnstileSecretKey: value.TURNSTILE_SECRET_KEY,
  discordWebhookUrl: value.DISCORD_WEBHOOK_URL,
  feishuWebhookUrl: value.FEISHU_WEBHOOK_URL,
  cronJobs: {
    username: value.CRON_JOBS_USERNAME,
    password: value.CRON_JOBS_PASSWORD,
  },
  ai: {
    gatewayApiKey: value.AI_GATEWAY_API_KEY,
    falApiKey: value.FAL_API_KEY,
    firecrawlApiKey: value.FIRECRAWL_API_KEY,
    fireworksApiKey: value.FIREWORKS_API_KEY,
    openaiApiKey: value.OPENAI_API_KEY,
    replicateApiToken: value.REPLICATE_API_TOKEN,
    googleGenerativeAiApiKey: value.GOOGLE_GENERATIVE_AI_API_KEY,
    deepseekApiKey: value.DEEPSEEK_API_KEY,
    openrouterApiKey: value.OPENROUTER_API_KEY,
  },
  oauth: {
    github: {
      clientId: value.GITHUB_CLIENT_ID,
      clientSecret: value.GITHUB_CLIENT_SECRET,
    },
    google: {
      clientId: value.GOOGLE_CLIENT_ID,
      clientSecret: value.GOOGLE_CLIENT_SECRET,
    },
  },
  rateLimit: {
    redisRestUrl: value.UPSTASH_REDIS_REST_URL,
    redisRestToken: value.UPSTASH_REDIS_REST_TOKEN,
    requireRedis: value.RATE_LIMIT_REQUIRE_REDIS ?? false,
  },
}));
const rawServerEnv = pickEnv(serverSchemaInput);

const parsedServerEnv = serverSchema.safeParse(rawServerEnv);

if (!parsedServerEnv.success) {
  console.error('❌ Invalid server environment variables', {
    issues: parsedServerEnv.error.format(),
    snapshot: maskEnvSnapshot(
      {
        DATABASE_URL: rawServerEnv.DATABASE_URL,
        BETTER_AUTH_SECRET: rawServerEnv.BETTER_AUTH_SECRET,
      },
      { revealLength: true }
    ),
  });
  throw new Error('Invalid server environment variables');
}

export const serverEnv = parsedServerEnv.data;

export type ServerEnv = typeof serverEnv;
