# @ai/agent-business

工商风险 Agent（端口 3003）：查询工商变更、经营异常、行政处罚、司法风险等风险信息。

## API 契约

`POST /api/query`

```json
{ "query": "查询星辰智能科技集团的风险信息" }
```

响应：`data` 为 `RiskItem[]`。

```json
{
  "success": true,
  "data": [
    {
      "id": "risk1",
      "enterpriseId": "e1",
      "type": "经营异常",
      "level": "yellow",
      "date": "2025-08-12",
      "detail": "未按期公示2024年度报告",
      "source": "市场监管总局"
    }
  ]
}
```

> 契约与 `packages/agent-core/src/graph-builder.ts` 消费方式强绑定（按 `enterpriseId` 与节点 `refId` 精确匹配标记风险），改动需同步。

## 数据源

`DATA_SOURCE=mock`（默认）：返回 `packages/shared/mock-data/risks.json`；`DATA_SOURCE=real`：经 `packages/shared/qichacha` 调用企查查预警通 API。

## 开发

```bash
pnpm --filter @ai/agent-business dev
```
