# AI 企业智能助手 — 项目计划与排期

> 本文档用于跟踪项目需求、排期和各里程碑的完成状态，便于分任务执行。

---

## 一、项目需求

### 1.1 业务目标

构建一个 **AI 企业智能助手**，业务人员通过自然语言查询，Agent 自动拆解任务并并行调用多个数据源（企业信息 / 客户图谱 / 工商资料），最终以**关联关系图谱**可视化呈现，辅助业务人员快速了解企业全貌和关联关系。

### 1.2 核心能力

| 能力 | 说明 |
|---|---|
| 自然语言查询 | 输入框接收用户自然语言，如"查阿里巴巴的关联企业和工商风险" |
| Supervisor 任务拆解 | LLM + Zod 结构化决策，决定激活哪些 Worker |
| 企业信息查询 | 查企业基本信息（名称、法人、注册资本、状态等） |
| 客户图谱查询 | 查关联关系（股权、任职、投资、实际控制人） |
| 工商资料查询 | 查工商变更、经营异常、司法风险、行政处罚 |
| 图谱可视化 | AntV G6 力导向图，节点着色、点击交互 |
| 多轮对话 | MemorySaver 持久化会话，支持上下文指代 |
| 数据源策略 | Mock 开发 → 企查查预警通 API 生产，环境变量切换 |

### 1.3 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | React 18 + TypeScript + Next.js 14（全栈） |
| Monorepo | pnpm workspace |
| Agent 编排 | @langchain/langgraph（Supervisor-Worker 模式） |
| LLM | @langchain/openai（DeepSeek 兼容） |
| 结构化输出 | zod |
| 图谱可视化 | @antv/g6 ^5 |
| 图数据库 | Neo4j（neo4j-driver） |
| 向量库 | Chroma（默认）+ Milvus（预留） |
| 企业数据源 | 企查查预警通 API（Mock 过渡） |

---

## 二、目录结构

```
aiCompany/
├─ AGENTS.md / rules.md              # 项目规则
├─ PROJECT_PLAN.md                   # 本文档
├─ pnpm-workspace.yaml
├─ package.json / tsconfig.base.json
├─ .npmrc / .gitignore / .env.local.example
├─ apps/
│  ├─ web/                           # 主应用：前端 UI + Supervisor 编排
│  ├─ agent-company/                 # 企业信息 Agent（Next.js，端口 3001）
│  ├─ agent-graph/                   # 客户图谱 Agent（Next.js，端口 3002）
│  └─ agent-business/                # 工商资料 Agent（Next.js，端口 3003）
├─ packages/
│  ├─ shared/                        # 公共能力层
│  │  ├─ api-keys/                   # API key 统一管理
│  │  ├─ types/                      # 共享类型
│  │  ├─ mock-data/                  # Mock 数据
│  │  ├─ vector-store/               # 向量库（Chroma + Milvus 预留）
│  │  ├─ neo4j/                      # Neo4j 封装
│  │  └─ qichacha/                   # 企查查 API 封装
│  └─ agent-core/                    # Agent 编排核心
│     ├─ state.ts                    # SupervisorState
│     ├─ entities.ts                 # Zod Schema
│     ├─ supervisor.ts               # Supervisor 节点
│     ├─ adapters/                   # HTTP Adapter（company/graph/business）
│     ├─ graph-builder.ts            # 图谱组装器
│     └─ agent.ts                    # LangGraph 图编排
└─ .trae/documents/                  # 设计文档
```

---

## 三、开发排期总览

| 阶段 | 内容 | 状态 | 预估 |
|---|---|---|---|
| **M0** | 规则文件（AGENTS.md / rules.md） | ✅ 完成 | 0.5天 |
| **M1** | Monorepo 初始化 | ✅ 完成 | 1天 |
| **M2** | packages/shared 公共能力层 | ✅ 完成 | 2天 |
| **M3** | packages/agent-core 编排核心 | ✅ 完成 | 2天 |
| **M4** | 三个 Agent 应用 | ✅ 完成 | 2天 |
| **M5** | apps/web 主应用 + 前端 UI | ✅ 完成 | 2天 |
| **M6** | 联调 + 多轮对话 + 降级 | ⬜ 待开始 | 1.5天 |
| **M7** | 测试 + 文档收尾 | ⬜ 待开始 | 1天 |

**总计：约 11.5 人天**

---

## 四、各里程碑详细任务

### M0：规则文件 ✅ 完成

- [x] 创建 AGENTS.md（项目级开发规范）
- [x] 创建 rules.md（细粒度开发规则）
- [x] 创建 react-agent.md（实现计划文档）

### M1：Monorepo 初始化 ✅ 完成

- [x] pnpm-workspace.yaml + .npmrc（store-dir 项目内）
- [x] 根 package.json（dev/build/typecheck/test）
- [x] tsconfig.base.json（paths 映射 @ai/*）
- [x] .gitignore + .env.local.example
- [x] packages/shared 骨架
- [x] packages/agent-core 骨架
- [x] pnpm install + typecheck 验证

### M2：packages/shared 公共能力层 ✅ 完成

- [x] types（Enterprise/GraphData/RiskItem/VectorDoc 等）
- [x] api-keys（LLM/企查查/Neo4j 统一管理）
- [x] mock-data（5 家企业 + 11 条关系 + 5 条风险）
- [x] vector-store（抽象接口 + Chroma + 工厂 + Milvus 骨架）
- [x] neo4j（连接封装 + getRelations 查询）
- [x] qichacha（API 封装，Mock/real 切换）
- [x] index.ts 统一导出 + typecheck

### M3：packages/agent-core 编排核心 ✅ 完成

- [x] state.ts（SupervisorState + Reducer，14 字段）
- [x] entities.ts（TaskDistributionSchema Zod 约束）
- [x] supervisor.ts（LLM + withStructuredOutput，带历史上下文）
- [x] adapters（company/graph/business HTTP Adapter，try/catch 降级）
- [x] graph-builder.ts（图谱组装 + 多轮增量合并）
- [x] agent.ts（LangGraph 图编排 + 条件路由 + MemorySaver）
- [x] index.ts 统一导出 + typecheck

### M4：三个 Agent 应用 ✅ 完成

#### M4.1 apps/agent-company（企业信息 Agent）

- [x] Next.js 项目初始化（端口 3001）
- [x] `app/api/query/route.ts`：POST /api/query
- [x] 调用 `@ai/shared` 的 qichachaClient.searchEnterprise
- [x] Mock 模式返回 mock 数据，real 模式调企查查 API
- [x] typecheck 验证

#### M4.2 apps/agent-graph（客户图谱 Agent）

- [x] Next.js 项目初始化（端口 3002）
- [x] `app/api/query/route.ts`：POST /api/query
- [x] 调用 `@ai/shared` 的 getRelations（Mock 模式）或 neo4jStore.getRelations（real 模式）
- [x] 返回 GraphData 结构
- [x] typecheck 验证

#### M4.3 apps/agent-business（工商资料 Agent）

- [x] Next.js 项目初始化（端口 3003）
- [x] `app/api/query/route.ts`：POST /api/query
- [x] 调用 qichachaClient.getRiskInfo + 向量库检索
- [x] 返回 RiskItem 数组
- [x] typecheck 验证

> M4 备注：三个应用均通过 typecheck + dev 冒烟（6 项用例）+ next build 验证。
> chromadb 的 https 动态 import 与 webpack 冲突，已在各 next.config.mjs 中以 externals 方式解决；
> qichachaClient 配置读取改为延迟加载，mock 模式不再要求配置 QICHACHA_API_KEY。

### M5：apps/web 主应用 + 前端 UI ✅ 完成

- [x] Next.js 项目初始化（端口 3000）
- [x] `app/api/agent/route.ts`：LangGraph 编排入口，SSE 流式返回
- [x] `app/api/llm/route.ts`：LLM 代理（密钥注入）
- [x] ChatInput 组件（自然语言输入）
- [x] SessionList 组件（多轮会话切换）
- [x] AgentProcess 组件（Supervisor 决策 + Worker 执行状态）
- [x] GraphView 组件（AntV G6 力导向图，增量更新）
- [x] NodeDetail 组件（节点详情面板）
- [x] 整体 UI 布局与样式

### M6：联调 + 多轮对话 + 降级 ✅ 完成

- [x] 端到端联调（输入 → Supervisor → Worker HTTP 并行 → 图谱渲染）
- [x] 多轮对话验证（上下文指代、会话切换、图谱增量更新）
- [x] 降级验证（停掉某个 Agent 服务，主流程不中断）
- [x] 数据源切换（DATA_SOURCE=mock/real，链路静态检查，运行时验证归入 M7 单测）
- [x] 向量库切换（VECTOR_BACKEND=chroma/milvus，工厂逻辑静态检查，运行时验证归入 M7 单测）

### M7：测试 + 文档收尾 ✅ 完成

- [x] 核心模块单测（Supervisor 决策、Adapter 降级、图谱组装、向量库接口，Vitest 共 63 例，核心实现行覆盖 100%）
- [x] milvus-store 骨架补充（notImplemented，含单测断言）
- [x] 各子目录 README（根 + 2 packages + 4 apps）
- [x] 全量校验（pnpm test + typecheck + build 全绿）

---

## 五、环境变量说明

| 变量 | 说明 | 默认值 |
|---|---|---|
| `LLM_API_KEY` | LLM API Key | - |
| `LLM_BASE_URL` | LLM API 地址 | https://api.deepseek.com/v1 |
| `LLM_MODEL` | LLM 模型名 | deepseek-chat |
| `QICHACHA_API_KEY` | 企查查预警通 API Key | - |
| `NEO4J_URI` | Neo4j 连接地址 | bolt://localhost:7687 |
| `NEO4J_USER` | Neo4j 用户名 | neo4j |
| `NEO4J_PASSWORD` | Neo4j 密码 | - |
| `VECTOR_BACKEND` | 向量库后端 | chroma |
| `CHROMA_PATH` | Chroma 持久化路径 | ./.chroma |
| `DATA_SOURCE` | 数据源策略 | mock |
| `AGENT_COMPANY_URL` | 企业信息 Agent 地址 | http://localhost:3001 |
| `AGENT_GRAPH_URL` | 图谱 Agent 地址 | http://localhost:3002 |
| `AGENT_BUSINESS_URL` | 工商资料 Agent 地址 | http://localhost:3003 |

---

## 六、端口规划

| 应用 | 端口 |
|---|---|
| apps/web | 3000 |
| apps/agent-company | 3001 |
| apps/agent-graph | 3002 |
| apps/agent-business | 3003 |

---

## 七、风险与降级策略

| 风险 | 降级策略 |
|---|---|
| LangGraph 在 Next.js API Route 兼容性 | 提前验证，必要时用独立 API Route |
| Neo4j 本地部署 | Mock 模式不依赖 Neo4j，可延后接入 |
| 企查查 API 限流 | 开发阶段用 Mock，生产再接入 |
| 多 app 端口冲突 | 统一端口规划（3000-3003） |
| AntV G6 v5 API 学习成本 | 锁定 v5 写法，提前验证最小渲染 |
