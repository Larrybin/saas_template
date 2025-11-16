# Repository Guidelines
使用Codex自带的apply_patch工具修改文件。尽量避免使用shell工具修改文件。
## Project Structure & Module Organization
The Next.js application resides in `src/`, with routed pages under `src/app`, shared UI primitives in `src/components`, and reusable logic separated into `src/lib`, `src/hooks`, and `src/stores`. Domain-specific features stay self-contained, for example billing code in `src/payment`. Mail templates live in `src/mail`, static content is stored in `content/`, localized copy in `messages/`, and public assets under `public/`. End-to-end data fixtures and helpers belong in `tests/`, while generated artifacts such as build outputs or coverage reports are kept in `test-results/` and `.next/` and should not be edited manually.

## Build, Test, and Development Commands
Install dependencies via `pnpm install`. Start local development with `pnpm dev`, produce an optimized build with `pnpm build`, and serve the compiled output using `pnpm start`. Run the formatting-aware lint pass through `pnpm lint`, apply safe fixes with `pnpm lint:fix`, and normalize formatting using `pnpm format`. Execute unit tests via `pnpm test`, switch to watch mode with `pnpm test:watch`, request coverage through `pnpm test:coverage`, and launch end-to-end Playwright suites using `pnpm test:e2e`. Common Cloudflare workflows rely on `pnpm preview`, `pnpm deploy`, and `pnpm upload`.

## Coding Style & Naming Conventions
TypeScript is the default language; prefer ES modules and React Server Components where possible. Biome enforces the style guide: two-space indentation, single quotes, trailing commas, and required semicolons. React components should use PascalCase (`DashboardCard.tsx`), hooks camelCase with a `use` prefix, and utility modules concise lowercase names (`formatDate.ts`). Tailwind classes follow layout, then typography, then state modifiers for clarity. Run `pnpm lint` before committing to autofix minor drift and surface violations early.

## Testing Guidelines
Vitest provides unit and integration coverage; place specs beside the implementation using `*.test.ts` or `*.test.tsx`. For scenario or browser coverage, Playwright lives in `tests/e2e` and is configured through `playwright.config.ts`. Target meaningful assertions over snapshot churn and document any manual QA steps in pull requests until automated coverage is expanded. Keep fixtures deterministic and reusable across suites.

## Commit & Pull Request Guidelines
Use Conventional Commit messages such as `feat: add usage analytics card` or `fix: guard missing locale`. Scope each commit to a focused change and avoid bundling unrelated refactors. Pull requests should outline intent, list high-impact files, link relevant issues, and attach screenshots or terminal logs for UI or CLI updates. Always note the verification commands run (for example `pnpm lint`, `pnpm test`) so reviewers can reproduce them quickly.

## Security & Configuration Tips
Copy `env.example` to `.env.local`, filling only the variables needed for the feature in progress. Keep secrets out of version control and rely on Vercel or Cloudflare dashboards for production credentials. When working with Drizzle migrations, use `pnpm db:generate` and `pnpm db:migrate` locally, and include schema diffs or notes in reviews so deployment environments stay consistent.
