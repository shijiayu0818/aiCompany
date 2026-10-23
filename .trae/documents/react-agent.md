# React + Next.js + LangGraph 企业智能助手实现计划（v3）

## Context

用户希望基于 React + TypeScript + Next.js 全栈搭建一个 AI 企业智能助手，覆盖以下能力：
- 自然语言查询企业关键信息（基本信息、关联关系、工商风险）
- 以图谱形式展示企业-人员-股权-关联企业网络
- 多轮对话，支持上下文指代（"它的子公司"、"再看看风险"）
- 向量知识库语义检索企业非结构化资料
- Agent 执行过程可视化（Supervisor 决策 → Worker 并行 → 图谱组装）

架构采用 **Monorepo + 独立 Next.js Agent** 模式：每个 Agent（企业信息/图谱/工商）是独立的 Next.js 应用，通过 HTTP API 暴露能力；Supervisor 在主应用中用 LangGraph 编排，HTTP 调用各 Worker。

已确认决策：
- 位置：`d:\前端进阶\ai从0到1\aiCompany`（Monorepo）
- 框架：React + TypeScript + Next.js 全栈（API Routes 替代独立后端）
- 数据源：开发阶段 Mock，生产阶段企查查预警通 API + Neo4j + 向量库
- 图数据库：Neo4j（存关联关系）
- 向量库：Chroma（默认），预留 Milvus 可插拔接口
- LLM：DeepSeek / OpenAI 兼容（Next.js API Route 代理，密钥不暴露前端）
- 图谱库：AntV G6 v5
- Agent 编排：LangGraph.js StateGraph（Supervisor-Worker + 条件路由 + MemorySaver）
- 公共层：`packages/shared`（API key、企查查 API、向量库、Neo4j、类型、Mock 数据）

---

## 1. 目录结构

```
aiCompany/
├─ AGENTS.md / rules.md
├─ pnpm-workspace.yaml
├─ package.json                    # 根脚本：pnpm -r dev（同时启动所有 app）
├─ apps/
│  ├─ web/                         # 主应用：前端 UI + Supervisor 编排
│  │  ├─ app/
│  │  │  ├─ page.tsx               # 前端 UI（对话 + 图谱 + 详情）
│  │  │  └─ api/
│  │  │     ├─ agent/route.ts      # Supervisor 入口：LangGraph 编排，HTTP 调用各 Worker
│  │  │     └─ llm/route.ts        # LLM 代理（密钥注入，不暴露前端）
│  │  ├─ components/               # ChatInput / GraphView / NodeDetail / AgentProcess
│  │  ├─ hooks/useAgent.ts         # Agent 调用封装（多轮状态管理）
│  │  └─ package.json
│  ├─ agent-company/               # 企业信息 Agent
│  │  └─ app/api/query/route.ts    # 调企查查 API，返回企业基本信息
│  ├─ agent-graph/                 # 客户图谱 Agent
│  │  └─ app/api/query/route.ts    # 查 Neo4j 图关联（股权/任职/投资）
│  └─ agent-business/              # 工商资料 Agent
│     └─ app/api/query/route.ts    # 向量库检索 + 企查查风险信息
├─ packages/
│  ├─ shared/                      # 公共能力层
│  │  ├─ api-keys/                 # API key 统一管理（企查查/LLM/Neo4j/向量库）
│  │  ├─ qichacha/                 # 企查查预警通 API 封装
│  │  ├─ vector-store/             # 向量库抽象接口 + Chroma/Milvus 实现
│  │  ├─ neo4j/                    # Neo4j 图数据库封装（查询/写入）
│  │  ├─ types/                    # 共享类型定义
│  │  └─ mock-data/                # Mock 数据（开发阶段，后续替换为真实数据源）
│  └─ agent-core/                  # Agent 核心编排
│     ├─ state.ts                  # SupervisorState
│     ├─ entities.ts               # Zod Schema
│     ├─ supervisor.ts             # Supervisor 节点（LLM 决策）
│     ├─ graph-builder.ts          # 图谱组装器
│     ├─ adapters/                 # HTTP Adapter（调用各 agent 服务）
│     │  ├─ company-adapter.ts     # → fetch agent-company
│     │  ├─ graph-adapter.ts       # → fetch agent-graph
│     │  └─ business-adapter.ts    # → fetch agent-business
│     └─ agent.ts                  # LangGraph 图编排 + 条件路由 + MemorySaver
```

---

## 2. 关键依赖

根 devDependencies：
- `typescript ^5.6`、`pnpm ^9`
- `concurrently ^9.0`（同时启动多个 app）

各 Next.js app 通用：
- `next ^14`、`react ^18.3`、`react-dom ^18.3`

packages/agent-core：
- `@langchain/core ^1.1`、`@langchain/langgraph ^1.2`（Supervisor-Worker 编排）
- `zod ^3.23`（Supervisor 结构化决策约束）

packages/shared：
- `@langchain/openai ^0.3`（LLM 客户端）
- `neo4j-driver ^5.20`（Neo4j 图数据库）
- `chromadb ^1.9`（向量库默认实现）

apps/web：
- `@antv/g6 ^5.0`（图谱可视化，锁定 v5）
- `@ai/agent-core`、`@ai/shared`

---

## 3. Agent 调用链（HTTP 版 Supervisor-Worker）

```
用户输入（第 N 轮）："再看看它的工商风险"
   ↓
前端 useAgent → POST web/api/agent { messages, supervisorTask, threadId }
   ↓
web/api/agent 中 LangGraph StateGraph 执行（MemorySaver 按 threadId 恢复历史）：
   1. supervisorNode:
      - 读取 messages 历史 + 当前 supervisorTask
      - LLM + withStructuredOutput(TaskDistributionSchema) 决策
      - 输出：needsCompanyInfo / needsGraph / needsBusiness + 各 Worker 查询 + reasoning
   2. 条件路由 addConditionalEdges:
      - needsCompanyInfo=true  → company_node
      - needsGraph=true        → graph_node
      - needsBusiness=true     → business_node
      - 全 false               → 直接 graph_builder_node
   3. Worker 并行执行（HTTP Adapter 调用对应 Agent 服务）：
      - companyAdapter  → POST agent-company:3001/api/query  → companyOutput
      - graphAdapter    → POST agent-graph:3002/api/query    → graphOutput
      - businessAdapter → POST agent-business:3003/api/query → businessOutput
      （每个 Adapter 独立 try/catch，HTTP 失败写 Output 不抛出）
   4. graphBuilderNode（Reporter）:
      - 汇总三路 Output
      - 组装 GraphData { nodes: [], edges: [] }
      - 与 currentGraph 合并（多轮增量更新，不覆盖）
   ↓
SSE 流式返回前端：
   - supervisor 决策  → { type: "supervisor", decision }
   - Worker 完成      → { type: "worker", name, output }
   - 图谱组装完成     → { type: "graph", graphData }
   - 最终消息         → { type: "final", content }
   ↓
前端 useAgent 增量渲染：AgentProcess 展示步骤，GraphView 渲染图谱
```

### Zod 决策 Schema（packages/agent-core/entities.ts）

```ts
export const TaskDistributionSchema = z.object({
  taskDescription: z.string().describe('精炼后的任务描述'),
  needsCompanyInfo: z.boolean().describe('是否需要查询企业基本信息'),
  companyQuery: z.string().optional().describe('分配给企业信息 Agent 的查询'),
  needsGraph: z.boolean().describe('是否需要查询关联关系图谱'),
  graphQuery: z.string().optional().describe('分配给图谱 Agent 的查询'),
  needsBusiness: z.boolean().describe('是否需要查询工商资料/风险'),
  businessQuery: z.string().optional().describe('分配给工商资料 Agent 的查询'),
  reasoning: z.string().describe('决策理由（可审计）'),
});
```

---

## 4. 前端组件树与数据流

```
App (apps/web/app/page.tsx)
 ├─ state: { sessions, currentThreadId, messages, graph, agentSteps, streaming }
 ├─ SessionList (左侧：会话列表，onSelect=切换 threadId)
 ├─ ChatInput (底部输入，onSend=触发 Agent)
 ├─ AgentProcess (展示 Supervisor 决策 + 各 Worker 执行状态)
 ├─ GraphView (受控 graph; onSelectNode=查询详情)
 │   └─ G6 Graph：力导向布局，节点按 type 着色，支持增量更新
 └─ NodeDetail (右侧：选中节点的工商/人员/风险卡片)
```

数据流：
- 用户输入 → fetchEventSource POST web/api/agent → useAgent 解析 SSE chunk → 更新 messages + agentSteps
- chunk 为 `graph` 类型 → setGraph(payload)（多轮时与已有 graph 合并）
- 点击 G6 节点 → 取 refId → 触发新一轮查询"查 {企业名} 的详情"
- 切换会话 → 用新 threadId 调用，MemorySaver 恢复历史

---

## 5. 数据层设计

### 5.1 数据源策略（Mock → 真实）

每个 Agent 内部通过环境变量 `DATA_SOURCE` 切换数据源，业务代码零改动：

```
开发阶段（DATA_SOURCE=mock）：
  agent-company → packages/shared/mock-data
  agent-graph   → packages/shared/mock-data（结构化关系）
  agent-business → packages/shared/mock-data

生产阶段（DATA_SOURCE=real）：
  agent-company → packages/shared/qichacha（企查查预警通 API）
  agent-graph   → packages/shared/neo4j（Neo4j 图查询）
  agent-business → packages/shared/vector-store（非结构化资料）+ qichacha（风险）
```

### 5.2 向量库（packages/shared/vector-store）

抽象接口：
```ts
export interface VectorStore {
  add(docs: VectorDoc[]): Promise<void>;
  search(query: string, options: { collection: string; topK: number }): Promise<VectorDoc[]>;
  delete(ids: string[]): Promise<void>;
  count(collection: string): Promise<number>;
}
```

工厂模式，默认 Chroma，预留 Milvus：
```ts
export function createVectorStore(): VectorStore {
  const backend = process.env.VECTOR_BACKEND ?? 'chroma';
  return backend === 'milvus' ? new MilvusStore() : new ChromaStore();
}
```

### 5.3 Neo4j 图数据库（packages/shared/neo4j）

封装企业关联关系查询（股权/任职/投资/控制），禁止业务代码直写 Cypher。

### 5.4 Worker 与数据源对应

| Agent | 开发阶段（Mock） | 生产阶段（真实） |
|---|---|---|
| agent-company | mock-data | 企查查预警通 API |
| agent-graph | mock-data（结构化关系） | Neo4j 图查询 |
| agent-business | mock-data | 向量库（非结构化资料）+ 企查查风险 |

---

## 6. Mock 数据样例

`packages/shared/mock-data/companies.json`：
```json
{
  "id": "e1",
  "name": "阿里巴巴集团",
  "creditCode": "91330100799655659H",
  "legalPerson": "张勇",
  "registeredCapital": "500000万元",
  "establishDate": "1999-09-09",
  "status": "存续",
  "industry": "互联网",
  "region": "浙江杭州"
}
```

`packages/shared/mock-data/relations.json`：
```json
{
  "nodes": [
    { "id": "e1", "type": "enterprise", "name": "阿里巴巴集团", "refId": "e1" },
    { "id": "p1", "type": "person", "name": "张勇" },
    { "id": "e2", "type": "enterprise", "name": "蚂蚁科技集团", "refId": "e2" }
  ],
  "edges": [
    { "source": "p1", "target": "e1", "type": "法定代表人", "label": "董事长" },
    { "source": "e1", "target": "e2", "type": "投资", "label": "33%" }
  ]
}
```

节点类型：`enterprise | person | shareholder`；边类型：`投资 | 任职 | 控制 | 关联`。

---

## 7. 关键代码片段

**State 定义**（packages/agent-core/state.ts）：
```ts
export const SupervisorStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({ reducer: messagesStateReducer, default: () => [] }),
  supervisorTask: Annotation<string>({ reducer: (c, n) => n, default: () => '' }),
  threadId: Annotation<string>({ reducer: (c, n) => n, default: () => '' }),
  needsCompanyInfo: Annotation<boolean>({ reducer: (c, n) => n, default: () => false }),
  needsGraph: Annotation<boolean>({ reducer: (c, n) => n, default: () => false }),
  needsBusiness: Annotation<boolean>({ reducer: (c, n) => n, default: () => false }),
  companyQuery: Annotation<string | undefined>({ reducer: (c, n) => n ?? c, default: () => undefined }),
  graphQuery: Annotation<string | undefined>({ reducer: (c, n) => n ?? c, default: () => undefined }),
  businessQuery: Annotation<string | undefined>({ reducer: (c, n) => n ?? c, default: () => undefined }),
  companyOutput: Annotation<string>({ reducer: (c, n) => n, default: () => '' }),
  graphOutput: Annotation<string>({ reducer: (c, n) => n, default: () => '' }),
  businessOutput: Annotation<string>({ reducer: (c, n) => n, default: () => '' }),
  currentGraph: Annotation<GraphData>({ reducer: (c, n) => n, default: () => ({ nodes: [], edges: [] }) }),
});
```

**HTTP Adapter**（packages/agent-core/adapters/company-adapter.ts）：
```ts
export const companyAdapter = async (state: SupervisorState): Promise<Partial<SupervisorState>> => {
  try {
    const query = state.companyQuery ?? state.supervisorTask;
    if (!query) return { companyOutput: 'Company query is missing.' };
    const res = await fetch(`${process.env.AGENT_COMPANY_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    return { companyOutput: JSON.stringify(data) };
  } catch (error) {
    return { companyOutput: `Company Agent unavailable: ${errorMessage(error)}` };
  }
};
```

**图编排**（packages/agent-core/agent.ts）：
```ts
export function buildCompanyAgentGraph(options?: { checkpointer?: MemorySaver }) {
  const workflow = new StateGraph(SupervisorStateAnnotation)
    .addNode('supervisor', supervisorNode)
    .addNode('company_node', companyAdapter)
    .addNode('graph_node', graphAdapter)
    .addNode('business_node', businessAdapter)
    .addNode('graph_builder_node', graphBuilderNode)
    .addEdge(START, 'supervisor')
    .addConditionalEdges('supervisor', (state) => {
      const next: string[] = [];
      if (state.needsCompanyInfo) next.push('company_node');
      if (state.needsGraph) next.push('graph_node');
      if (state.needsBusiness) next.push('business_node');
      return next.length ? next : ['graph_builder_node'];
    }, { company_node: 'company_node', graph_node: 'graph_node', business_node: 'business_node', graph_builder_node: 'graph_builder_node' })
    .addEdge('company_node', 'graph_builder_node')
    .addEdge('graph_node', 'graph_builder_node')
    .addEdge('business_node', 'graph_builder_node')
    .addEdge('graph_builder_node', END);
  return workflow.compile({ checkpointer: options?.checkpointer });
}
```

**LLM 代理**（apps/web/app/api/llm/route.ts）：
```ts
export async function POST(req: Request) {
  const { messages } = await req.json();
  const llm = new ChatOpenAI({
    model: process.env.LLM_MODEL ?? 'deepseek-chat',
    apiKey: getApiKey('LLM'),
    configuration: { baseURL: process.env.LLM_BASE_URL },
  });
  const stream = await llm.stream(messages);
  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          controller.enqueue(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
        }
        controller.enqueue('data: [DONE]\n\n');
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}
```

**Agent 服务示例**（apps/agent-company/app/api/query/route.ts）：
```ts
export async function POST(req: Request) {
  const { query } = await req.json();
  const dataSource = process.env.DATA_SOURCE ?? 'mock';
  const result = dataSource === 'real'
    ? await qichacha.searchEnterprise(query)
    : mockData.searchEnterprise(query);
  return Response.json(result);
}
```

**G6 图谱渲染**（apps/web/components/GraphView.tsx）：
```ts
const graph = new Graph({
  container: ref.current!,
  layout: { type: 'force', linkDistance: 150, nodeStrength: -520, collide: 58 },
  node: {
    type: 'circle',
    size: (d) => (d.data.type === 'enterprise' ? 48 : 34),
    style: { fill: (d) => NODE_COLORS[d.data.type as string] ?? '#64748b' },
    labelText: (d) => d.data.name,
    labelPlacement: 'bottom',
  },
  edge: { style: { stroke: '#94a3b8' }, labelText: (d) => d.data.label },
  behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
});
graph.setData({
  nodes: graphData.nodes.map((n) => ({ id: n.id, data: n })),
  edges: graphData.edges.map((e) => ({ source: e.source, target: e.target, data: e })),
});
graph.render();
```

---

## 8. 实现步骤

1. 初始化 Monorepo：`pnpm-workspace.yaml` + 根 `package.json` + `tsconfig.base.json` + `.gitignore` + `.env.local.example`
2. 建 `packages/shared`：api-keys / types / mock-data 骨架，验证 workspace 引用
3. 建 `packages/shared/vector-store`：抽象接口 + Chroma 实现 + 工厂模式
4. 建 `packages/shared/neo4j`：Neo4j 连接 + 查询封装
5. 建 `packages/shared/qichacha`：企查查预警通 API 封装（骨架，Mock 过渡）
6. 建 `packages/agent-core`：state / entities / supervisor / adapters（HTTP）/ graph-builder / agent
7. 建 `apps/agent-company`：Next.js 应用，`/api/query` 调 shared 数据源
8. 建 `apps/agent-graph`：Next.js 应用，`/api/query` 查 Neo4j / Mock 关系
9. 建 `apps/agent-business`：Next.js 应用，`/api/query` 向量库 + 企查查风险
10. 建 `apps/web`：Next.js 主应用，`/api/agent`（LangGraph 编排）+ `/api/llm`（代理）
11. 实现前端：ChatInput + AgentProcess + GraphView（AntV G6）+ NodeDetail + SessionList
12. 联调：输入 → Supervisor 决策 → Worker 并行 HTTP → 图谱渲染 → 多轮追问
13. 补 `milvus-store.ts` 骨架，验证 `VECTOR_BACKEND` 切换
14. 补单测：Supervisor 决策、HTTP Adapter 降级、图谱组装、向量库接口

---

## 9. 验证方法

**启动**：
```bash
cd aiCompany
pnpm install
pnpm dev   # concurrently 启动 web(:3000) + agent-company(:3001) + agent-graph(:3002) + agent-business(:3003)
```

**Agent 服务冒烟**：
```bash
curl -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -d '{"query":"阿里巴巴"}'
```
预期返回企业基本信息（Mock 或企查查）。

**LLM 代理冒烟**：
```bash
curl -N -X POST http://localhost:3000/api/llm \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好"}]}'
```
预期看到 SSE 流式 token 输出。

**前端联调**：浏览器开 `http://localhost:3000`，输入"查阿里巴巴的关联企业和工商风险"，验证：
- AgentProcess 依次展示 Supervisor 决策 → 三个 Worker 并行 HTTP → 图谱组装
- GraphView 出现力导向图谱，企业节点蓝色、人员绿色、股东橙色
- 第二轮输入"再看看它的子公司"，图谱增量追加子公司节点

**多轮对话验证**：切换会话 → 历史图谱恢复；新建会话 → 空白状态。

**数据源切换验证**：改 `DATA_SOURCE=real`，agent-company 应调企查查 API；改回 `mock` 恢复 Mock 数据。

**降级验证**：停掉 agent-company 服务，companyAdapter 应返回降级信息，graph/business 仍正常。

---

## 10. 风险与权衡

- **多 app 启动复杂度**：开发环境需同时启动 4 个 Next.js 应用，用 `concurrently` + 统一端口管理。
- **HTTP 调用延迟**：Worker 间从内存调用变为 HTTP 调用，增加网络开销；对 MVP 可接受，生产可考虑同机部署或内网。
- **多轮上下文过长**：messages 历史会累积，需在 Supervisor Prompt 中对历史做摘要压缩，只保留最近 N 轮 + 摘要。
- **G6 v5 API**：锁定 `@antv/g6 ^5.0`，v5 数据驱动 API 与 v4 差异大，不可混用。
- **Neo4j 部署**：开发环境需 Neo4j 实例（Docker standalone），Mock 模式下可跳过。
- **LLM 决策不稳定**：Supervisor 的 Zod 约束 + reasoning 字段可审计；若 LLM 输出不符合 Schema，LangChain 自动重试，重试仍失败则降级为激活全部 Worker。
- **企查查 API 配额**：生产阶段注意 API 调用频率限制，必要时加缓存。
