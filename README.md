# AI 企业智能助手

基于 LangGraph 多 Agent 编排的企业智能助手：自然语言查询企业基本信息、股权关联图谱与工商风险，结果实时渲染为可交互的关系图谱。

## 架构

```
apps/
  web/               主应用（端口 3000）：SSE 编排入口 + 三栏 UI（G6 图谱）
  agent-company/     企业信息 Agent（端口 3001）
  agent-graph/       关联图谱 Agent（端口 3002）
  agent-business/    工商风险 Agent（端口 3003）
packages/
  shared/            公共能力：类型、密钥、Mock 数据、向量库、Neo4j、企查查
  agent-core/        编排核心：Supervisor 决策 + Worker Adapter + 图谱组装
```

编排流程：`START → supervisor（LLM 结构化决策）→ 并行 Worker（HTTP Adapter 调用各 Agent）→ graph-builder（增量合并图谱）→ END`，多轮会话经 MemorySaver 按 threadId 持久化。

## 快速开始

```bash
pnpm install
pnpm dev          # 同时启动 web + 三个 Agent
```

访问 http://localhost:3000，输入如「全面分析星辰智能科技集团，包括基本信息、股权图谱和风险情况」。

## 环境变量

复制根目录 `.env.local`（见 PROJECT_PLAN.md 第五节），开发阶段默认 `DATA_SOURCE=mock`，无需任何 API Key 即可运行；接入 LLM 决策需配置 `LLM_API_KEY`。

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动全部 4 个服务 |
| `pnpm test` | 全仓单测（Vitest） |
| `pnpm typecheck` | 全仓类型检查 |
| `pnpm build` | 全仓构建 |

## 约定

全仓约束见 [AGENTS.md](./AGENTS.md)，模块细则见各子目录 README，开发排期见 [PROJECT_PLAN.md](./PROJECT_PLAN.md)。
