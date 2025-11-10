(() => {
  // Load env files when running locally
  try {
    const dotenv = require('dotenv');
    const envPath = process.env.ENV_FILE ?? '.env.local';
    const result = dotenv.config({ path: envPath });
    if (result.error) {
      console.warn(`[env-check] Unable to load ${envPath}:`, result.error.message);
    } else {
      console.info(`[env-check] Loaded environment file: ${envPath}`);
    }
  } catch (error) {
    // dotenv is optional
  }

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
    console.error('Current values snapshot:', REQUIRED_ENV.reduce((acc, key) => {
      acc[key] = process.env[key];
      return acc;
    }, {}));
    process.exit(1);
  }

  console.info('All required env vars are present.');
})();
