# Repository Guidelines

## Project Structure & Module Organization
The Next.js app lives in `src/`, with routes under `src/app`, shared UI in `src/components`, and reusable logic in `src/lib`, `src/hooks`, and `src/stores`. Feature-specific integrations (e.g., billing or notifications) stay inside matching folders such as `src/payment` to isolate domain logic. Static content sits in `content/`, locale strings in `messages/`, and public-facing assets in `public/`.

## Build, Test, and Development Commands
Run `pnpm install` once per environment to sync dependencies. Use `pnpm dev` for hot-reload development, `pnpm build` to emit production bundles, and `pnpm start` to serve the compiled output. Lint with `pnpm lint`, auto-fix safe issues via `pnpm lint:fix`, and apply formatting rules with `pnpm format`.

## Coding Style & Naming Conventions
Code is TypeScript-first with modern React patterns. Biome enforces 2-space indentation, single quotes, trailing commas, and required semicolons—run `pnpm lint` before pushing to stay compliant. Name React components with PascalCase (`UserCard.tsx`), hooks as camelCase with a `use` prefix, and keep Tailwind classes ordered by layout → typography → state for readability.

## Testing Guidelines
The template ships without a default test runner, so add targeted tests beside features as `*.test.tsx` or `*.spec.ts`. When introducing new behavior, document manual QA steps that cover main flows (auth, billing, dashboard) until automated coverage exists. Always ensure new tests or QA notes run cleanly before requesting review.

## Commit & Pull Request Guidelines
Follow Conventional Commits such as `feat: add billing webhook` or `fix: handle missing locale`, keeping each commit focused on a single concern. Pull requests should summarize changes, link related issues, and attach screenshots or terminal logs for UI/CLI updates. Include verification steps (e.g., `pnpm build`, `pnpm lint`) so reviewers can replay your checks quickly.

## Security & Configuration Tips
Copy `env.example` to `.env.local`, filling only the variables required for the feature at hand to avoid leaking secrets. Cloudflare and Vercel settings are tracked in `vercel.json` and the `opennextjs-cloudflare` scripts—document further setup in PRs so deployment previews stay reproducible.
