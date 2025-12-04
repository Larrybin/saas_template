import fs from 'node:fs';
import path from 'node:path';

type ViolationLevel = 'error' | 'warn';

type Violation = {
  file?: string;
  message: string;
  level?: ViolationLevel;
};

type ErrorCodesInfo = {
  byKey: Map<string, string>;
  values: Set<string>;
};

const API_ROUTES_DIR = path.join('src', 'app', 'api');
const ACTIONS_DIR = path.join('src', 'actions');
const ERROR_CODES_FILE = path.join('src', 'lib', 'server', 'error-codes.ts');
const ERROR_CODES_DOC_FILE = path.join('docs', 'error-codes.md');
const ERROR_UI_REGISTRY_FILE = path.join(
  'src',
  'lib',
  'domain-error-ui-registry.ts'
);
const SRC_DIR = 'src';

function walkFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function checkApiEnvelopes(repoRoot: string, violations: Violation[]) {
  const apiDir = path.join(repoRoot, API_ROUTES_DIR);
  const allFiles = walkFiles(apiDir);

  for (const filePath of allFiles) {
    if (!filePath.endsWith('route.ts')) continue;
    if (filePath.includes(`${path.sep}__tests__${path.sep}`)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('NextResponse.json')) continue;

    const rel = path.relative(repoRoot, filePath).replace(/\\/g, '/');
    // 允许极简健康检查路由（如 /api/ping）不使用 Envelope。
    if (rel === 'src/app/api/ping/route.ts') {
      continue;
    }

    // 更精确地检查 JSON 对象属性，而不是简单匹配任意 "success" 字符串，减少误报。
    const hasSuccessKey = /['"]?success['"]?\s*:/.test(content);

    if (!hasSuccessKey) {
      violations.push({
        file: rel,
        level: 'error',
        message:
          'API route uses NextResponse.json but does not appear to set a `success` field in the JSON envelope.',
      });
    }
  }
}

function checkSafeActions(repoRoot: string, violations: Violation[]) {
  const actionsDir = path.join(repoRoot, ACTIONS_DIR);
  const allFiles = walkFiles(actionsDir);

  for (const filePath of allFiles) {
    if (!filePath.endsWith('.ts')) continue;
    // schemas.ts 只包含 zod schema，不需要依赖 safe-action
    if (filePath.endsWith(`${path.sep}schemas.ts`)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    const usesSafeAction =
      content.includes("@/lib/safe-action'") ||
      content.includes('@/lib/safe-action"');

    if (!usesSafeAction) {
      const rel = path.relative(repoRoot, filePath).replace(/\\/g, '/');
      violations.push({
        file: rel,
        level: 'error',
        message:
          'Server Action does not import `@/lib/safe-action`. New actions should be created via safe-action clients.',
      });
    }
  }
}

function checkActionsUseErrorBoundary(
  repoRoot: string,
  violations: Violation[]
): void {
  const actionsDir = path.join(repoRoot, ACTIONS_DIR);
  const allFiles = walkFiles(actionsDir);

  for (const filePath of allFiles) {
    if (!filePath.endsWith('.ts')) continue;
    // schemas.ts 只包含 zod schema，不是具体 Server Action 实现
    if (filePath.endsWith(`${path.sep}schemas.ts`)) continue;

    const content = fs.readFileSync(filePath, 'utf8');

    // 只在文件中实际使用了 .action(...) 时才检查，避免误报纯类型/辅助文件。
    if (!content.includes('.action(')) continue;

    const usesErrorBoundary = content.includes('withActionErrorBoundary(');
    if (!usesErrorBoundary) {
      const rel = path.relative(repoRoot, filePath).replace(/\\/g, '/');
      violations.push({
        file: rel,
        level: 'warn',
        message:
          'Server Action uses `.action(...)` but does not appear to be wrapped in `withActionErrorBoundary(...)`. Consider using the shared error boundary helper, for example: `userActionClient.schema(schema).action(withActionErrorBoundary({ logger, logMessage, ... }, async (args) => { /* handler */ }))`, to keep logging and DomainError handling consistent.',
      });
    }
  }
}

function checkActionErrorEnvelopes(
  repoRoot: string,
  violations: Violation[]
): void {
  const actionsDir = path.join(repoRoot, ACTIONS_DIR);
  const allFiles = walkFiles(actionsDir);

  for (const filePath of allFiles) {
    if (!filePath.endsWith('.ts')) continue;
    if (filePath.endsWith(`${path.sep}schemas.ts`)) continue;

    const content = fs.readFileSync(filePath, 'utf8');

    const matches = content.matchAll(/success\s*:\s*false/g);
    let hasWarnedForFile = false;

    for (const match of matches) {
      if (match.index == null) continue;
      const start = Math.max(0, match.index - 80);
      const end = Math.min(content.length, match.index + 200);
      const snippet = content.slice(start, end);

      // 如果 error envelope 中没有 code 字段，给出 warning 级别提示（不阻断 CI）。
      if (!/code\s*:/.test(snippet)) {
        if (!hasWarnedForFile) {
          const rel = path.relative(repoRoot, filePath).replace(/\\/g, '/');
          violations.push({
            file: rel,
            level: 'warn',
            message:
              'Found `{ success: false, ... }` envelope without a nearby `code` field. Consider adding an error code for better observability.',
          });
          hasWarnedForFile = true;
        }
      }
    }
  }
}

function readErrorCodesInfo(repoRoot: string): ErrorCodesInfo {
  const filePath = path.join(repoRoot, ERROR_CODES_FILE);
  const content = fs.readFileSync(filePath, 'utf8');

  // 形如：SomeError: 'SOME_ERROR_CODE'
  const entryRegex = /(\w+)\s*:\s*'([A-Z0-9_]+)'/g;
  const byKey = new Map<string, string>();
  const values = new Set<string>();

  // biome: noAssignInExpressions 要求避免在条件中做赋值，这里改为显式循环。
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const match = entryRegex.exec(content);
    if (!match) break;
    const key = match[1];
    const value = match[2];
    if (typeof key !== 'string' || typeof value !== 'string') {
      continue;
    }
    byKey.set(key, value);
    values.add(value);
  }

  return { byKey, values };
}

function readErrorCodes(repoRoot: string): Set<string> {
  return readErrorCodesInfo(repoRoot).values;
}

function checkErrorCodesDocumented(repoRoot: string, violations: Violation[]) {
  const codes = readErrorCodes(repoRoot);
  const docsPath = path.join(repoRoot, ERROR_CODES_DOC_FILE);
  const docsContent = fs.readFileSync(docsPath, 'utf8');

  for (const code of codes) {
    if (!docsContent.includes(code)) {
      violations.push({
        file: 'docs/error-codes.md',
        level: 'error',
        message: `Error code \`${code}\` is defined in src/lib/server/error-codes.ts but not mentioned in docs/error-codes.md.`,
      });
    }
  }
}

function checkErrorUiRegistry(repoRoot: string, violations: Violation[]) {
  const codes = readErrorCodes(repoRoot);
  const filePath = path.join(repoRoot, ERROR_UI_REGISTRY_FILE);
  const content = fs.readFileSync(filePath, 'utf8');

  const uiCodeRegex = /^\s*([A-Z0-9_]+)\s*:/gm;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const match = uiCodeRegex.exec(content);
    if (!match) break;
    const code = match[1];
    if (typeof code !== 'string') {
      continue;
    }
    if (!codes.has(code)) {
      const rel = path.relative(repoRoot, filePath).replace(/\\/g, '/');
      violations.push({
        file: rel,
        level: 'error',
        message: `Error UI registry contains code \`${code}\` which is not present in ErrorCodes.`,
      });
    }
  }
}

function checkDomainErrorCodes(repoRoot: string, violations: Violation[]) {
  const { byKey } = readErrorCodesInfo(repoRoot);
  const validKeys = new Set(byKey.keys());

  const srcDir = path.join(repoRoot, SRC_DIR);
  const allFiles = walkFiles(srcDir);

  for (const filePath of allFiles) {
    if (!filePath.endsWith('.ts')) continue;
    const content = fs.readFileSync(filePath, 'utf8');

    if (!content.includes('extends DomainError')) continue;

    const codeRefRegex = /ErrorCodes\.([A-Za-z0-9_]+)/g;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const match = codeRefRegex.exec(content);
      if (!match) break;
      const key = match[1];
      if (typeof key !== 'string') {
        continue;
      }
      if (!validKeys.has(key)) {
        const rel = path.relative(repoRoot, filePath).replace(/\\/g, '/');
        violations.push({
          file: rel,
          level: 'error',
          message: `DomainError subclass references ErrorCodes.${key}, which does not exist in src/lib/server/error-codes.ts.`,
        });
      }
    }
  }
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const violations: Violation[] = [];

  checkApiEnvelopes(repoRoot, violations);
  checkSafeActions(repoRoot, violations);
  checkActionsUseErrorBoundary(repoRoot, violations);
  checkActionErrorEnvelopes(repoRoot, violations);
  checkErrorCodesDocumented(repoRoot, violations);
  checkErrorUiRegistry(repoRoot, violations);
  checkDomainErrorCodes(repoRoot, violations);

  const errors = violations.filter((v) => v.level !== 'warn');
  const warnings = violations.filter((v) => v.level === 'warn');

  if (warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.warn('Protocol / error model checks completed with warnings:\n');
    for (const violation of warnings) {
      const location = violation.file ? `${violation.file}: ` : '';
      // eslint-disable-next-line no-console
      console.warn(`- ${location}${violation.message}`);
    }
  }

  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.error('Protocol / error model checks failed:\n');
    for (const violation of errors) {
      const location = violation.file ? `${violation.file}: ` : '';
      // eslint-disable-next-line no-console
      console.error(`- ${location}${violation.message}`);
    }
    process.exit(1);
  } else {
    // eslint-disable-next-line no-console
    console.log('Protocol / error model checks passed.');
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Error while running protocol / error model checks:', error);
  process.exit(1);
});
