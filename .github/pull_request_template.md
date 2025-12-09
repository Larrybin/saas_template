# PR 模板（协议 / 错误码 / 文档同步）

## 变更类型

- [ ] 功能新增
- [ ] Bug 修复
- [ ] 文档更新
- [ ] 重构 / 内部优化

## 协议与错误码检查

- [ ] 若修改了 `/api/*` 路由或 `src/actions/*`：已运行 `pnpm check:protocol` 并处理其中的错误（errors）与合理的警告（warnings）。
- [ ] 若新增或修改错误码：已按 `.codex/plan/error-codes-expansion.md` 中的「错误码变更 checklist」同步更新代码与文档。
- [ ] 若本 PR 涉及协议或错误模型的重大变更：已评估并（如有必要）更新 `.codex/plan/protocol-future-techdebt-report.md` 及相关 `.codex/plan/*`/`docs/*` 文档（例如 `docs/error-codes.md`、`docs/error-logging.md`、`docs/api-reference.md`、各 `*-lifecycle.md`）。

## 测试

- [ ] 已运行 `pnpm test`（如有测试脚本）并通过。
- [ ] 已在受影响模块附近补充或更新必要的测试（如适用）。

## 其他说明

- 在此简要说明本 PR 的业务背景与主要影响点（可选）。

