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
const API_DOC_FILE = path.join('docs', 'api-reference.md');
const ERROR_LOGGING_DOC_FILE = path.join('docs', 'error-logging.md');
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
        level: 'error',
        message:
          'Server Action uses `.action(...)` but is not wrapped in `withActionErrorBoundary(...)`. All Actions must wrap their handler with the shared error boundary helper (for example: `userActionClient.schema(schema).action(withActionErrorBoundary({ logger, logMessage, ... }, async (args) => { /* handler */ }))`) so CI now treats missing wrappers as an error.',
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

function checkApiDocsReferences(repoRoot: string, violations: Violation[]) {
  const apiDir = path.join(repoRoot, API_ROUTES_DIR);
  const apiFiles = walkFiles(apiDir);
  const apiRoutes = new Set<string>();

  for (const filePath of apiFiles) {
    if (!filePath.endsWith('route.ts')) continue;
    if (filePath.includes(`${path.sep}__tests__${path.sep}`)) continue;

    const rel = path
      .relative(path.join(repoRoot, API_ROUTES_DIR), filePath)
      .replace(/\\/g, '/');
    // 形如 "foo/bar/route.ts" → "/api/foo/bar"
    const withoutSuffix = rel.replace(/\/route\.ts$/, '');
    const routePath = `/api/${withoutSuffix}`;
    apiRoutes.add(routePath);
  }

  const docsPath = path.join(repoRoot, API_DOC_FILE);
  if (!fs.existsSync(docsPath)) {
    return;
  }
  const docsContent = fs.readFileSync(docsPath, 'utf8');

  const documentedRoutes = new Set<string>();
  const routeRegex = /`(\/api\/[a-zA-Z0-9_\-/]*)`/g;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const match = routeRegex.exec(docsContent);
    if (!match) break;
    const route = match[1];
    if (typeof route === 'string' && route.startsWith('/api/')) {
      documentedRoutes.add(route);
    }
  }

  for (const route of apiRoutes) {
    if (!documentedRoutes.has(route)) {
      violations.push({
        file: 'docs/api-reference.md',
        level: 'warn',
        message: `API route \`${route}\` is implemented under src/app/api but does not appear in docs/api-reference.md. Consider adding it to the API reference.`,
      });
    }
  }
}

function checkSpansDocumented(repoRoot: string, violations: Violation[]) {
  const srcDir = path.join(repoRoot, SRC_DIR);
  const allFiles = walkFiles(srcDir);
  const codeSpans = new Set<string>();

  // 从代码中提取 span: '...'
  const spanRegex = /span\s*:\s*['"]([a-zA-Z0-9_.-]+)['"]/g;

  for (const filePath of allFiles) {
    if (!filePath.endsWith('.ts')) continue;
    const content = fs.readFileSync(filePath, 'utf8');

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const match = spanRegex.exec(content);
      if (!match) break;
      const span = match[1];
      if (typeof span === 'string' && span.includes('.')) {
        codeSpans.add(span);
      }
    }
  }

  const docPath = path.join(repoRoot, ERROR_LOGGING_DOC_FILE);
  if (!fs.existsSync(docPath)) {
    return;
  }
  const docsContent = fs.readFileSync(docPath, 'utf8');

  const docSpans = new Set<string>();
  const docSpanRegex = /`([a-z0-9_.-]+)`/gi;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const match = docSpanRegex.exec(docsContent);
    if (!match) break;
    const span = match[1];
    if (typeof span === 'string' && span.includes('.')) {
      docSpans.add(span);
    }
  }

  for (const span of codeSpans) {
    if (!docSpans.has(span)) {
      violations.push({
        file: 'docs/error-logging.md',
        level: 'warn',
        message: `Span \`${span}\` is used in code but not documented in docs/error-logging.md. Consider adding it to the span table.`,
      });
    }
  }

  for (const span of docSpans) {
    if (!codeSpans.has(span)) {
      violations.push({
        file: 'docs/error-logging.md',
        level: 'warn',
        message: `Span \`${span}\` is documented in docs/error-logging.md but was not found in the source tree. Consider removing or updating it if it is obsolete.`,
      });
    }
  }
}

function checkPaymentSecurityViolationUsage(
  repoRoot: string,
  violations: Violation[]
) {
  const srcDir = path.join(repoRoot, SRC_DIR);
  const allFiles = walkFiles(srcDir);
  let hasPaymentSecurityViolationReference = false;

  for (const filePath of allFiles) {
    if (!filePath.endsWith('.ts')) continue;
    const content = fs.readFileSync(filePath, 'utf8');

    if (content.includes('ErrorCodes.PaymentSecurityViolation')) {
      hasPaymentSecurityViolationReference = true;
      break;
    }
  }

  if (!hasPaymentSecurityViolationReference) {
    violations.push({
      level: 'warn',
      message:
        'ErrorCodes.PaymentSecurityViolation is defined but not referenced in the source tree. Confirm that payment webhook security failures still surface this code, or remove it if truly unused.',
    });
  }

  const webhooksDir = path.join(repoRoot, API_ROUTES_DIR, 'webhooks');
  if (!fs.existsSync(webhooksDir)) {
    return;
  }

  const webhookFiles = walkFiles(webhooksDir);

  for (const filePath of webhookFiles) {
    if (!filePath.endsWith('route.ts')) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('ErrorCodes.UnexpectedError')) {
      const rel = path.relative(repoRoot, filePath).replace(/\\/g, '/');
      violations.push({
        file: rel,
        level: 'warn',
        message:
          'Webhook route references `ErrorCodes.UnexpectedError`. Ensure security failures still use `PAYMENT_SECURITY_VIOLATION` and that `UNEXPECTED_ERROR` is only used for truly unexpected conditions.',
      });
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
  checkApiDocsReferences(repoRoot, violations);
  checkSpansDocumented(repoRoot, violations);
  checkPaymentSecurityViolationUsage(repoRoot, violations);

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
