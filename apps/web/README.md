# @ai/web

主应用（端口 3000）：SSE 流式编排入口 + 三栏响应式 UI。

## API

| 接口 | 说明 |
|---|---|
| `POST /api/agent` | LangGraph 编排入口，SSE（`text/event-stream`）逐事件推送：`start → supervisor → worker×N → graph → done` |
| `GET /api/agent?threadId=` | 从 MemorySaver 恢复会话，返回 `currentGraph` 与 Supervisor 决策上下文 |
| `POST /api/llm` | LLM 薄代理，密钥仅在服务端注入 |

SSE 事件中 `worker.status` 含失败/不可用关键词时标记为 `error`，前端 AgentProcess 面板实时呈现各节点状态。

## UI 结构

三栏布局：左侧 `SessionList`（多轮会话切换）+ `ChatInput`；中部 `GraphView`（AntV G6 力导向图，随 SSE `graph` 事件增量更新）；右侧 `AgentProcess`（Supervisor 决策 + Worker 状态）+ `NodeDetail`（节点详情）。

## 实现要点

- 编排核心来自 `@ai/agent-core`（transpilePackages 源码引用），图谱渲染走 G6 v5 动态导入避免 SSR
- 多轮对话状态由 LangGraph MemorySaver 管理，前端仅持有 threadId 列表（sessionStorage），不重复维护对话状态
- 颜色/字号/间距/z-index 一律使用 `app/globals.css` 设计系统变量，图谱节点颜色从 CSS 变量读取
- chromadb 经 webpack externals 排除打包（见 next.config.mjs 注释）

## 开发

```bash
pnpm --filter @ai/web dev
```
