import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { websiteConfig } from '@/config/website';

const sendMock = vi.hoisted(() =>
  vi.fn(async () => ({ data: { id: 'email_1' }, error: null }))
);
const ResendCtorMock = vi.hoisted(() => {
  return class ResendMock {
    emails = { send: sendMock };
  };
});
const serverEnvState = vi.hoisted(() => ({ resendApiKey: 'rk_test' }));
const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
const getTemplateMock = vi.hoisted(() =>
  vi.fn(async (_input: unknown) => ({
    html: '<p>Hello</p>',
    text: 'Hello',
    subject: 'Subject',
  }))
);

vi.mock('resend', () => ({
  Resend: ResendCtorMock,
}));

vi.mock('@/env/server', () => ({
  serverEnv: serverEnvState,
}));
vi.mock('@/lib/server/logger', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/logger')>(
    '@/lib/server/logger'
  );

  return {
    ...actual,
    getLogger: () => loggerMock,
    createEmailLogFields: actual.createEmailLogFields,
  };
});
vi.mock('@/mail', () => ({
  getTemplate: (input: unknown) => getTemplateMock(input),
}));

// eslint-disable-next-line import/first
import { ResendProvider } from '../resend';

describe('ResendProvider', () => {
  const originalMailConfig = { ...websiteConfig.mail };
  const fallbackFromEmail = originalMailConfig.fromEmail ?? 'hello@example.com';
  const originalEnvState = { resendApiKey: serverEnvState.resendApiKey };
  beforeEach(() => {
    vi.clearAllMocks();
    serverEnvState.resendApiKey = 'rk_test';
    websiteConfig.mail.fromEmail = 'hello@example.com';
  });
  afterEach(() => {
    serverEnvState.resendApiKey = originalEnvState.resendApiKey;
    websiteConfig.mail.provider = originalMailConfig.provider;
    websiteConfig.mail.fromEmail = fallbackFromEmail;
  });

  it('throws when environment variables are missing', () => {
    serverEnvState.resendApiKey = '';
    expect(() => new ResendProvider()).toThrow('RESEND_API_KEY');

    serverEnvState.resendApiKey = 'rk_test';
    websiteConfig.mail.fromEmail = '';
    expect(() => new ResendProvider()).toThrow('Default from email address');
  });

  it('returns failure when required fields are missing for raw email', async () => {
    const provider = new ResendProvider();
    const result = await provider.sendRawEmail({
      to: '',
      subject: 'Missing recipient',
      html: '',
    });
    expect(result).toMatchObject({
      success: false,
      error: 'Missing required fields',
    });
    expect(loggerMock.warn).toHaveBeenCalledWith(
      'Missing required fields for email send',
      expect.any(Object)
    );
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('renders template and delegates to Resend client', async () => {
    const provider = new ResendProvider();
    const result = await provider.sendTemplate({
      to: 'user@example.com',
      template: 'forgotPassword',
      context: { url: 'https://example.com/reset', name: 'User' },
    });
    expect(result).toEqual({ success: true, messageId: 'email_1' });
    expect(getTemplateMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({
      from: 'hello@example.com',
      to: 'user@example.com',
      subject: 'Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
    });
  });
});
