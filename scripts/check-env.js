const REQUIRED_ENV = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'NEXT_PUBLIC_BASE_URL',
  'NEXT_PUBLIC_MAIL_FROM_EMAIL',
  'NEXT_PUBLIC_MAIL_SUPPORT_EMAIL',
];

const missing = REQUIRED_ENV.filter((key) => {
  const value = process.env[key];
  return !value || value.length === 0;
});

if (missing.length > 0) {
  console.error('Missing required environment variables:', missing.join(', '));
  process.exit(1);
}
