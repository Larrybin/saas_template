(() => {
	const isVerbose = process.argv.includes("--verbose");
	const report = (message) => console.info(`[env-check] ${message}`);
	const warn = (message, error) =>
		console.warn(`[env-check] ${message}${error ? `: ${error}` : ""}`);

	try {
		const { loadEnvConfig } = require("@next/env");
		loadEnvConfig(process.cwd());
		report("Loaded environment configuration via @next/env");
	} catch (error) {
		warn("Unable to load environment with @next/env", error?.message);
	}

	if (process.env.ENV_FILE) {
		try {
			const dotenv = require("dotenv");
			dotenv.config({ path: process.env.ENV_FILE });
			report(`Loaded override file: ${process.env.ENV_FILE}`);
		} catch (error) {
			warn(
				`Unable to load override file ${process.env.ENV_FILE}`,
				error?.message,
			);
		}
	}

	const maskValue = (value) => {
		if (!value) {
			return value;
		}
		const prefix = value.slice(0, 2);
		return `${prefix}${prefix ? "***" : "***"} (len ${value.length})`;
	};

	const REQUIRED_ENV = [
		"DATABASE_URL",
		"BETTER_AUTH_SECRET",
		"NEXT_PUBLIC_BASE_URL",
		"NEXT_PUBLIC_MAIL_FROM_EMAIL",
		"NEXT_PUBLIC_MAIL_SUPPORT_EMAIL",
	];

	const missing = REQUIRED_ENV.filter((key) => {
		const value = process.env[key];
		return !value || value.length === 0;
	});

	if (missing.length > 0) {
		console.error(
			"Missing required environment variables:",
			missing.join(", "),
		);
		if (isVerbose) {
			console.error(
				"Current values snapshot (masked):",
				REQUIRED_ENV.reduce((acc, key) => {
					acc[key] = maskValue(process.env[key]);
					return acc;
				}, {}),
			);
		}
		process.exit(1);
	}

	report("All required env vars are present.");
})();
