/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

type Diagnostic = {
  file: string;
  line: number;
  column: number;
  message: string;
};

const projectRoot = path.resolve(__dirname, '..');
const SRC_DIR = path.join(projectRoot, 'src');

const IGNORED_DIRS = new Set([
  'node_modules',
  '.next',
  '.open-next',
  '.wrangler',
  '.cursor',
  '.claude',
  '.kiro',
  '.vscode',
  '.source',
  '.pnpm-store',
  'dist',
  'build',
  'coverage',
  'tests',
]);

function isIgnoredDir(name: string): boolean {
  return IGNORED_DIRS.has(name);
}

function collectSourceFiles(dir: string, out: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (isIgnoredDir(entry.name)) continue;
      collectSourceFiles(path.join(dir, entry.name), out);
      continue;
    }

    if (!entry.isFile()) continue;

    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      out.push(path.join(dir, entry.name));
    }
  }
}

function createSourceFile(filePath: string): ts.SourceFile {
  const content = fs.readFileSync(filePath, 'utf8');
  return ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.ESNext,
    /*setParentNodes*/ true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

function hasDirective(
  sourceFile: ts.SourceFile,
  value: 'use client' | 'use server'
): boolean {
  for (const stmt of sourceFile.statements) {
    if (!ts.isExpressionStatement(stmt)) break;
    if (!ts.isStringLiteral(stmt.expression)) break;
    if (stmt.expression.text === value) return true;
  }
  return false;
}

function isClientBoundaryFile(
  relativePath: string,
  sf: ts.SourceFile
): boolean {
  if (hasDirective(sf, 'use client')) return true;
  if (
    relativePath.startsWith('src/components/') ||
    relativePath.startsWith('src/components\\') ||
    relativePath.startsWith('src/hooks/') ||
    relativePath.startsWith('src/hooks\\')
  ) {
    return true;
  }
  return false;
}

function isRouteHandlerFile(relativePath: string): boolean {
  if (
    !relativePath.startsWith('src/app/') &&
    !relativePath.startsWith('src\\app\\')
  ) {
    return false;
  }
  return /[\\/]+route\.ts$/.test(relativePath);
}

function report(
  diagnostics: Diagnostic[],
  filePath: string,
  node: ts.Node,
  message: string
): void {
  const { line, character } = ts.getLineAndCharacterOfPosition(
    node.getSourceFile(),
    node.getStart()
  );
  const relative = path.relative(projectRoot, filePath).replace(/\\/g, '/');
  diagnostics.push({
    file: relative,
    line: line + 1,
    column: character + 1,
    message,
  });
}

function checkClientImports(
  filePath: string,
  sourceFile: ts.SourceFile,
  diagnostics: Diagnostic[]
): void {
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.moduleSpecifier) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;

    const spec = stmt.moduleSpecifier.text;

    if (
      spec === 'server-only' ||
      spec === 'postgres' ||
      spec.startsWith('node:') ||
      spec.startsWith('@/lib/server') ||
      spec === '@/db' ||
      spec.startsWith('@/payment/data-access')
    ) {
      report(
        diagnostics,
        filePath,
        stmt.moduleSpecifier,
        `Client 文件不得导入 server-only / Node-only 模块: "${spec}"`
      );
    }
  }
}

function checkRouteUseServer(
  filePath: string,
  sourceFile: ts.SourceFile,
  diagnostics: Diagnostic[]
): void {
  if (!hasDirective(sourceFile, 'use server')) return;

  for (const stmt of sourceFile.statements) {
    if (!ts.isExpressionStatement(stmt)) continue;
    if (!ts.isStringLiteral(stmt.expression)) continue;
    if (stmt.expression.text !== 'use server') continue;

    report(
      diagnostics,
      filePath,
      stmt,
      `Route Handler 文件中禁止使用 'use server'，请移除该指令（Route Handler 本身已在服务端运行）。`
    );
    break;
  }
}

function main(): void {
  const files: string[] = [];
  collectSourceFiles(SRC_DIR, files);

  const diagnostics: Diagnostic[] = [];

  for (const filePath of files) {
    const relativePath = path
      .relative(projectRoot, filePath)
      .replace(/\\/g, '/');

    const sourceFile = createSourceFile(filePath);

    const isClient = isClientBoundaryFile(relativePath, sourceFile);
    const isRoute = isRouteHandlerFile(relativePath);

    if (isClient) {
      checkClientImports(filePath, sourceFile, diagnostics);
    }

    if (isRoute) {
      checkRouteUseServer(filePath, sourceFile, diagnostics);
    }
  }

  if (diagnostics.length === 0) {
    console.log(
      '[runtime-boundaries] 所有检查通过（未发现 server/client 运行时边界违规）。'
    );
    return;
  }

  for (const diag of diagnostics) {
    console.error(
      `ERROR [runtime-boundaries] ${diag.file}:${diag.line}:${diag.column} ${diag.message}`
    );
  }

  console.error(
    `[runtime-boundaries] 检测到 ${diagnostics.length} 处运行时边界违规，请修复后重试。`
  );
  process.exit(1);
}

main();
