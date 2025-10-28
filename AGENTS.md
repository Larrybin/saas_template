# Repository Guidelines

## Project Structure & Module Organization
The Next.js application lives under `src/`, with routing in `src/app`, shared UI in `src/components`, and reusable logic in `src/lib`, `src/hooks`, and `src/stores`. Domain-specific modules such as `src/payment`, `src/newsletter`, and `src/notification` keep integrations isolated. Static site content for docs, blog, and changelog lives in `content/`, while locale strings sit in `messages/`. Public assets (logos, screenshots, blocks) are stored in `public/`.

## Build, Test, and Development Commands
Install dependencies with `pnpm install`. Use `pnpm dev` for a hot-reloading dev server, `pnpm build` to produce a production bundle, and `pnpm start` to serve the build locally. Run `pnpm lint` or `pnpm format` to enforce Biome rules, and `pnpm lint:fix` for safe auto-fixes. Database migrations are managed with Drizzle: `pnpm db:generate`, `pnpm db:migrate`, and `pnpm db:push`. Utility scripts like `pnpm list-users` surface seeded data during debugging.

## Coding Style & Naming Conventions
TypeScript and modern React patterns are mandatory. Biome (see `biome.json`) enforces 2-space indentation, single quotes, trailing commas, and required semicolons. Name components with PascalCase (`UserCard.tsx`), hooks with `useX` camelCase, and co-locate feature helpers in feature folders. Prefer module-relative imports configured by `tsconfig.json` paths, and keep Tailwind class names sorted by layout → typography → state for readability.

## Testing Guidelines
The template ships without a default test runner; add tests alongside features using `*.test.ts(x)` or `*.spec.ts(x)` depending on tooling. Always run `pnpm lint` and, when relevant, `pnpm knip` before opening a PR to catch unused exports. For database-affecting changes, create a dedicated migration in `src/db` and verify it with `pnpm db:migrate`. Provide manual QA notes covering key user flows (auth, billing, dashboard) when automated coverage is absent.

## Commit & Pull Request Guidelines
Follow Conventional Commits (`feat: add billing webhook`, `fix: handle missing locale`). Keep commits scoped to a single concern. Pull requests should include: concise summary, screenshots or terminal output for UI/CLI changes, references to related issues, and a checklist of verification steps (`pnpm build`, `pnpm lint`). Tag reviewers responsible for touched modules (e.g., payments, analytics) to keep knowledge paths clear.

## Environment & Deployment Notes
Copy `env.example` to `.env.local` and populate only the variables required for the scenario you are implementing. Cloudflare and Vercel settings are tracked in `vercel.json` and `opennextjs-cloudflare` scripts; document any additional secrets or DNS steps in the PR description so deploy previews remain reproducible.
