# AGENTS.md

> 项目级「记忆」：人类开发与 AI 协作共同遵守的约定。
> 本文件只写不可协商的原则；技术域细节放各子目录 README 或深参考文档。
> 优先级：本文件 > rules.md > 全局 user_rules.md。

## 一、测试与质量

1. 核心模块（Agent 编排、Supervisor 决策、Adapter、向量库封装）目标 100% 行覆盖；纯 UI 布局可豁免，但回归测试必须全绿。
2. 提交前必须依次运行：`pnpm test`、`pnpm typecheck`、`pnpm build`，全绿方可提交。
3. 声称修复/完成前必须实际运行验证命令并确认输出，禁止未验证即报告成功。
4. 评测门禁：`packages/agent-eval` 提供 `pnpm eval:skip-llm`（注入决策、零密钥、可进 CI）；决策准确率 ≥80% 且节点命中率 ≥70% 才通过，否则退出码 1。agent-eval 反向依赖 agent-core/shared，禁止被其它包依赖。
5. 仅 Mock 外部依赖（LLM API、向量库、企业数据源）；项目内部服务用真实实现测试。

## 二、架构与数据流

1. **Monorepo 架构**：`apps/` 下放可独立运行的应用（web 主应用 + 各 Agent），`packages/` 下放共享库（shared 公共能力 + agent-core 编排核心）。
2. **每个 Agent 是独立的 Next.js 应用**（apps/agent-company、apps/agent-graph、apps/agent-business），通过 HTTP API 暴露能力，禁止跨应用直接 import 业务逻辑。
3. **企业图谱数据（GraphData: nodes + edges）为唯一数据源**，UI 组件只消费图谱状态，禁止直接操作底层数据源。
4. Agent 编排统一走 LangGraph StateGraph，所有状态变更经 SupervisorState 的 Reducer，禁止旁路直改 State。
5. Worker 统一经 HTTP Adapter 调用对应 Agent 服务，Adapter 负责 HTTP 请求 + 错误降级，禁止 Supervisor 直接操作数据源。
6. 新增 Worker 须同步：独立 Next.js 应用、HTTP Adapter、State 字段、Zod Schema、条件路由分支、单测。
7. Supervisor 决策输出必须用 Zod Schema 约束（withStructuredOutput），禁止自由文本解析。
8. 每个 Adapter 必须独立 try/catch，错误写入对应 Output 字段，禁止抛出导致整体失败。

## 三、数据存储

1. **Neo4j 图数据库**：存储企业关联关系（股权/任职/投资/控制），Agent 通过 `packages/shared/neo4j` 封装查询，禁止在业务代码中直写 Cypher。
2. **向量库**：默认 Chroma，预留 Milvus 接口；只存非结构化企业资料（工商文档、风险描述），Worker 只依赖 VectorStore 抽象接口（add/search/delete/count）。
3. 切换向量库后端只改环境变量 `VECTOR_BACKEND`，业务代码零改动。
4. 向量持久化目录（`.chroma/`）不入 git。
5. **数据源策略**：开发阶段用 Mock（packages/shared/mock-data），生产阶段接企查查预警通 API；通过环境变量 `DATA_SOURCE=mock|real` 切换，业务代码零改动。

## 四、UI 与设计系统

1. 颜色、字号、间距、z-index 一律使用设计系统变量，禁止组件内硬编码。
2. 图谱可视化统一走 AntV G6，禁止混用其他图库。
3. 交互组件须支持 `focus-visible`、`aria-label`，动画响应 `prefers-reduced-motion`。
4. 多轮对话状态统一由 LangGraph MemorySaver（threadId）管理，前端只做展示，禁止本地维护重复状态。

## 五、安全与凭证

1. 所有 API key（LLM、企查查预警通、Neo4j、向量库）统一由 `packages/shared/api-keys` 管理，从环境变量读取，禁止在各应用中分散配置。
2. 生产级密钥请求必经 Next.js API Route（`/api/*`），**严禁前端代码持有任何 API Key**。
3. 任何带 `NEXT_PUBLIC_` 前缀的环境变量等于公开给浏览器，禁止用其承载密钥。
4. 密钥不入 git：本地用 `.env.local`（已 gitignore）。
5. LLM 流式输出用 SSE（`text/event-stream`），禁止缓冲完整响应后一次性返回。

## 六、工作流与协作

1. 开工/改码前先建独立分支，主分支保持干净；完成后合并并清理。
2. Commit 沿用 `feat:` / `fix:` / `refactor:` / `docs:` 前缀。
3. 架构/结构变更必须同步更新本文件或对应子目录 README。
4. 新增能力前先查目录结构与现有 Adapter，确认改动应落在哪个文件，避免在错误层级接入。

## 七、上下文披露

- 分层取用：**本文件（全仓约束）→ 子目录 README（模块细则）→ 深参考文档**。
- 长参考文档做成 Skill 按需加载，不写进本文件。
