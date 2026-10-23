# @ai/agent-core

LangGraph 编排核心：Supervisor 决策 + Worker HTTP Adapter + 图谱组装。被 `apps/web` 引用运行，不直接对外提供 HTTP 服务。

## 编排流程

```
START → supervisor → 条件路由 → [company_node | graph_node | business_node] 并行 → graph_builder → END
```

| 文件 | 职责 |
|---|---|
| `state.ts` | SupervisorState 全字段 Reducer（messages 累积、图谱增量合并） |
| `entities.ts` | Supervisor 决策 Zod Schema（withStructuredOutput 约束） |
| `supervisor.ts` | LLM 结构化决策：分析查询意图，分配 Worker 与查询语句 |
| `adapters/*` | 三个 Worker 的 HTTP Adapter：请求对应 Agent 服务，独立 try/catch 降级，单个失败不阻塞整体 |
| `graph-builder.ts` | 汇总 Worker 输出：解析图谱、附加企业详情与风险标记、按 id 去重增量合并 |
| `agent.ts` | StateGraph 装配 + MemorySaver 多轮会话 |

## 多轮会话

`createGraph()` 默认挂载 MemorySaver，调用侧传 `configurable.thread_id` 即可跨请求恢复状态；会话切换恢复走 `graph.getState(config)`。

## 扩展新 Worker 的固定步骤

1. 新建独立 Next.js 应用（`apps/*`）暴露 `/api/query`
2. 新增 Adapter（`src/adapters/`，含独立 try/catch 降级）
3. `state.ts` 增加决策与输出字段（明确 Reducer 规则）
4. `entities.ts` Schema 增加字段（OpenAI strict 模式：可选语义用 `.nullable()`）
5. `agent.ts` 注册节点与条件路由分支
6. 补充单测

## 测试

```bash
pnpm --filter @ai/agent-core test
```

覆盖：Supervisor 决策归一与消息构造（mock ChatOpenAI）、三个 Adapter 降级全分支、graph-builder 组装与风险精确匹配、编排图条件路由与多轮 Reducer。核心模块行覆盖 100%。

## 已知兼容性约束

- DeepSeek 不支持 `response_format: json_schema`，`withStructuredOutput` 必须传 `method: 'functionCalling'`
- OpenAI strict 结构化输出要求 Schema 全字段 required，可选语义用 `.nullable()` + 消费侧 `?? undefined` 归一
