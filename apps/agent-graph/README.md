# @ai/agent-graph

关联图谱 Agent（端口 3002）：查询企业关联关系（股权、投资、任职、实际控制人等），返回图谱数据。

## API 契约

`POST /api/query`

```json
{ "query": "查询星辰智能科技集团的股权结构" }
```

响应：`data` 为 `GraphData`（nodes + edges）。

```json
{
  "success": true,
  "data": {
    "nodes": [
      { "id": "e1", "type": "enterprise", "name": "星辰智能科技集团", "refId": "e1", "meta": "人工智能" },
      { "id": "p1", "type": "person", "name": "张明远" }
    ],
    "edges": [
      { "id": "r1", "source": "p1", "target": "e1", "type": "法定代表人", "label": "董事长", "weight": 1 }
    ]
  }
}
```

> 契约与 `packages/agent-core/src/graph-builder.ts` 消费方式强绑定，改动需同步。

## 数据源

`DATA_SOURCE=mock`（默认）：按查询关键词返回 `packages/shared/mock-data/relations.json` 的相关子集；`DATA_SOURCE=real`：经 `packages/shared/neo4j` 查询图数据库（禁止业务代码直写 Cypher）。

## 开发

```bash
pnpm --filter @ai/agent-graph dev
```
