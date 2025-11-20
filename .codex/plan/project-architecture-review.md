# 项目架构评审计划（mksaas-template）

## 任务说明

- 任务：参考最佳实践，对当前 Next.js SaaS 模板项目架构做全面 / 细致 / 深入的评审。
- 输出：以「分层 / 模块」为主体结构的高层架构点评和关键改进建议清单。
- 范围：界面层（app/components/docs/content）、应用 / 领域层（lib/payment/hooks/stores 等）、基础设施层（DB/env/log/外部服务）、以及若干端到端业务流。

## 执行步骤概览

1. 收集全局工程与配置信息  
   - 阅读 `AGENTS.md`、`README.md`、`next.config.ts`、`tsconfig.json`、`vercel.json`、`source.config.ts` 等。  
   - 目标：明确技术栈、部署/运行环境、代码规范与目录约定。

2. 梳理目录结构与模块拓扑  
   - 重点关注：`src/`、`content/`、`docs/`、`tests/`、`src/mail`、`src/payment` 等。  
   - 目标：形成文字版「模块/目录拓扑图」。

3. 评审界面层（UI / Routing）  
   - 范围：`src/app`、`src/components`、`content`、`docs`。  
   - 目标：评估路由结构、组件分层、复用性与跨模块耦合。

4. 评审应用 / 领域层  
   - 范围：`src/lib`、`src/payment`、`src/hooks`、`src/stores` 及相关 actions / services。  
   - 目标：评估业务规则聚合方式、模块边界与可测试性。

5. 评审基础设施层  
   - 范围：Drizzle/数据库、`drizzle.config.ts` 与 schema、env/config 管理、日志与错误处理、第三方集成（Stripe/Redis/AI Provider/Cloudflare/OpenNext）。  
   - 目标：评估基础设施抽象层次、对外部依赖的隔离程度以及错误/日志链路。

6. 端到端业务流评审  
   - 候选流程：认证登录/注册、credits 购买与更新、使用 credits 触发一次 AI 请求。  
   - 目标：从 UI → app → 领域服务 → 基础设施，追踪调用链和数据流，识别跨层耦合与可靠性问题。

7. 生成架构评审报告（按分层 / 模块组织）  
   - 包含：整体架构鸟瞰、各层优点与问题、端到端流程剖面图、关键决策点评。

8. 汇总关键改进建议清单  
   - 将各层发现的问题提炼为改进项，给出大致优先级（短期 / 中期）。

## 备注

- 本计划仅针对架构评审与建议，不直接修改业务逻辑代码。  
- 如后续根据评审结果执行重构，将另行制定针对性的重构计划。

