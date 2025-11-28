## 任务：修复 Fumadocs UI i18n 根因（Missing `<I18nProvider />`）并对齐 RootProvider 新约定

### 背景

- 运行时错误：`Error: Missing <I18nProvider />`
  - 项目已配置 Fumadocs Core i18n（`src/lib/docs/i18n.ts` + `docsI18nConfig`）。
  - Fumadocs UI 组件内部调用 i18n context 时，树上没有对应的 Provider。
- 控制台告警：`fumadocs-ui/provider export will be removed on v17`
  - 所有示例和 Providers 仍从 `fumadocs-ui/provider` 导入 `RootProvider`。

### 目标

1. 在 Next.js `[locale]` 根布局下，为 Fumadocs UI 接入 i18n context，消除 `Missing <I18nProvider />`。
2. 对齐 Fumadocs 新约定：使用 `defineI18nUI` + `RootProvider i18n`，而不是手动 `<I18nProvider>` 包裹。
3. 统一 `RootProvider` 导入路径到 `fumadocs-ui/provider/next`，包含代码与文档示例。

### 设计要点（方案 1B）

- 不在树上显式引入 `<I18nProvider />`，而是：
  - 用 `defineI18nUI(docsI18nConfig, { translations })` 生成 `provider(locale)`。
  - 在全局 `Providers` 中，将 `RootProvider` 写成：`<RootProvider theme={theme} i18n={provider(locale)}>`。
- locale 来源：
  - `src/app/[locale]/layout.tsx` 中通过 `params: Promise<{ locale: Locale }>` 获取。
  - 与 `src/i18n/routing.ts` 中的 `routing.locales` / `DEFAULT_LOCALE` 保持一致。

### 实施步骤摘要

1. **梳理现有布局与 locale 来源**
   - 确认 `src/app/[locale]/layout.tsx` 使用 `params: Promise<{ locale: Locale }>`。
   - 确认 `Providers` 当前签名为 `({ children }: ProvidersProps)`，且只在布局中被无参调用。
   - 核实 `docsI18nConfig` 与 `DEFAULT_LOCALE` / `LOCALES` 一致。

2. **新增 docs UI i18n 封装模块**
   - 新增 `src/lib/docs/ui-i18n.ts`：
     - `import { defineI18nUI } from 'fumadocs-ui/i18n';`
     - `import { docsI18nConfig } from './i18n';`
     - `const { provider } = defineI18nUI(docsI18nConfig, { translations: { en: { displayName: 'English' }, zh: { displayName: '中文' } } });`
     - `export function getDocsUiI18n(locale: string) { return provider(locale); }`

3. **调整 Providers 支持 RootProvider i18n**
   - 修改 `src/app/[locale]/providers.tsx`：
     - 导入改为 `import { RootProvider } from 'fumadocs-ui/provider/next';`
     - 新增导入：`import { getDocsUiI18n } from '@/lib/docs/ui-i18n';`
     - `ProvidersProps` 增加 `locale: string`。
     - JSX 中将 `RootProvider` 写为：`<RootProvider theme={theme} i18n={getDocsUiI18n(locale)}>...`
   - 保持原有 `QueryProvider` / `ThemeProvider` / `ActiveThemeProvider` / `TooltipProvider` 包裹顺序不变。

4. **在布局中传入 locale**
   - 修改 `src/app/[locale]/layout.tsx`：
     - 在 `LocaleLayout` 中从 `params` 解构得到 `locale`。
     - 将 `<Providers>` 替换为 `<Providers locale={locale}>`。
     - 保持 `<html lang={locale}>` 与传入的 `locale` 一致。

5. **统一 RootProvider 导入路径（代码 + 文档示例）**
   - 搜索所有使用 `fumadocs-ui/provider` 的位置：
     - 应用代码：`src/app/[locale]/providers.tsx`（已改为 `provider/next`）。
     - 文档示例：`content/docs/**/*.mdx`, `content/blog/**/*.mdx`。
   - 对文档中 RootProvider 示例进行迁移：
     - `import { RootProvider } from 'fumadocs-ui/provider';`
       → `import { RootProvider } from 'fumadocs-ui/provider/next';`
     - 保持示例签名与上下文一致，并在需要时将 `ReactNode` 改为显式 `React.ReactNode`。
   - 对使用 `fumadocs-ui/root-provider` 的搜索示例：
     - 统一改为 `fumadocs-ui/provider/next`，避免混淆不同入口。

6. **验证与回归**
   - 运行 `pnpm lint`，确保 Biome 通过（本次已通过，并自动修正 1 个文件格式）。
   - 尝试运行 `pnpm exec tsc --noEmit` 时遇到 PowerShell 参数解析问题（`/d` 被误读为脚本路径），需在 CI 或类 Unix 环境下验证类型检查。
   - 尝试运行 `pnpm test --runTestsByPath` 时，Vitest 报 `Unknown option --runTestsByPath`，停止进一步定制化 test 命令。
   - 建议在 CI（Linux）环境中执行标准 `pnpm exec tsc --noEmit` 和 `pnpm test` 做完整验证。

### 预期效果

- Fumadocs UI 不再抛出 `Error: Missing <I18nProvider />`，因为 `RootProvider` 通过 `i18n` prop 挂上了正确的 UI i18n 上下文。
- 控制台不再出现 `fumadocs-ui/provider export will be removed on v17` 告警。
- 文档中所有 RootProvider 使用示例与当前依赖版本推荐的 `fumadocs-ui/provider/next` 入口保持一致，避免读者 copy-paste 后遇到废弃告警。

