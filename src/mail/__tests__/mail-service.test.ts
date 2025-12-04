import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { websiteConfig } from '@/config/website';
import { createMailProviderStub } from '../../../tests/helpers/mail';

const providerState = { stub: createMailProviderStub() };
const originalMailConfig = { ...websiteConfig.mail };
const fallbackFromEmail = originalMailConfig.fromEmail ?? 'alerts@example.com';
const { ResendProviderMock } = vi.hoisted(() => ({
  ResendProviderMock: vi.fn(function MockedResendProvider() {
    return providerState.stub.provider;
  }),
}));

vi.mock('../provider/resend', () => ({
  ResendProvider: ResendProviderMock,
}));

async function loadMailModule() {
  return await import('../index');
}

describe('mail service', () => {
  beforeEach(async () => {
    await vi.resetModules();
    providerState.stub = createMailProviderStub();
    ResendProviderMock.mockClear();
    websiteConfig.mail.provider = 'resend';
    websiteConfig.mail.fromEmail = 'alerts@example.com';
  });
  afterAll(() => {
    providerState.stub = createMailProviderStub();
  });
  afterEach(() => {
    websiteConfig.mail.provider = originalMailConfig.provider;
    websiteConfig.mail.fromEmail = fallbackFromEmail;
    vi.doUnmock('@/mail/mail-config-provider');
  });

  it('throws descriptive error when mail provider is unsupported', async () => {
    await vi.resetModules();

    vi.doMock('@/mail/mail-config-provider', () => ({
      mailConfigProvider: {
        getMailConfig: () =>
          ({
            provider: 'invalid',
            fromEmail: 'alerts@example.com',
            supportEmail: 'support@example.com',
          }) as never,
      },
    }));

    const mail = await import('../index');

    expect(() => mail.initializeMailProvider()).toThrow(
      'Unsupported mail provider: invalid'
    );
  });

  it('initializes provider once and reuses cached instance', async () => {
    const mail = await loadMailModule();
    const first = mail.initializeMailProvider();
    const second = mail.getMailProvider();
    expect(first).toBe(second);
    expect(ResendProviderMock).toHaveBeenCalledTimes(1);
  }, 10000);

  it('delegates sendEmail to template/sendRaw handlers', async () => {
    const mail = await loadMailModule();

    const templateResult = await mail.sendEmail({
      to: 'user@example.com',
      template: 'forgotPassword',
      context: { url: 'https://example.com/reset', name: 'User' },
    });
    expect(templateResult).toBe(true);
    expect(providerState.stub.sendTemplate).toHaveBeenCalledTimes(1);

    const rawResult = await mail.sendEmail({
      to: 'user@example.com',
      subject: 'Hello',
      html: '<strong>Hi</strong>',
    });
    expect(rawResult).toBe(true);
    expect(providerState.stub.sendRawEmail).toHaveBeenCalledTimes(1);
  }, 10000);
});
