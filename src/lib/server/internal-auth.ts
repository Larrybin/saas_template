import type { HeaderGetter, Logger } from '@/lib/server/logger';

export type BasicAuthCredentials = {
  username: string;
  password: string;
};

export type ExpectedCredentials =
  | {
      username: string;
      password: string;
    }
  | {
      username?: undefined;
      password?: undefined;
    };

function toHeaderGetter(source: Request | HeaderGetter): HeaderGetter {
  if ('get' in source) {
    return source;
  }

  return {
    get(name: string) {
      return source.headers.get(name);
    },
  };
}

export function parseBasicAuthHeader(
  source: Request | HeaderGetter
): BasicAuthCredentials | null {
  const headers = toHeaderGetter(source);
  const authHeader = headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return null;
  }

  const [, base64Credentials] = authHeader.split(' ');
  if (!base64Credentials) {
    return null;
  }

  const credentials = Buffer.from(base64Credentials, 'base64').toString(
    'utf-8'
  );
  const [username, password] = credentials.split(':');

  if (!username || !password) {
    return null;
  }

  return { username, password };
}

export function validateInternalJobBasicAuth(
  request: Request,
  logger: Logger,
  expected: ExpectedCredentials
): boolean {
  const parsed = parseBasicAuthHeader(request);

  if (!parsed) {
    return false;
  }

  const expectedUsername = expected.username;
  const expectedPassword = expected.password;

  if (!expectedUsername || !expectedPassword) {
    logger.error(
      'Basic auth credentials not configured in environment variables'
    );
    return false;
  }

  return (
    parsed.username === expectedUsername && parsed.password === expectedPassword
  );
}
