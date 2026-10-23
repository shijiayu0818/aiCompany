# @ai/agent-company

企业信息 Agent（端口 3001）：查询企业基本信息（名称、法人、注册资本、成立日期、经营状态、行业、地区等）。

## API 契约

`POST /api/query`

```json
{ "query": "查询星辰智能科技集团的基本信息" }
```

响应：`data` 为单个企业对象（或 null）。

```json
{
  "success": true,
  "data": {
    "id": "e1",
    "name": "星辰智能科技集团",
    "creditCode": "91110000MA01XK7D2Y",
    "legalPerson": "张明远",
    "registeredCapital": "50000万元",
    "status": "存续",
    "industry": "人工智能",
    "region": "北京"
  }
}
```

> 契约与 `packages/agent-core/src/graph-builder.ts` 消费方式强绑定（按 `name` 匹配附加 detail），改动需同步。

## 数据源

`DATA_SOURCE=mock`（默认）：返回 `packages/shared/mock-data` 虚构企业；`DATA_SOURCE=real`：经 `packages/shared/qichacha` 调用企查查预警通 API（密钥由 `api-keys` 从环境变量读取，且延迟到 real 分支才读取，mock 模式零密钥依赖）。

## 开发

```bash
pnpm --filter @ai/agent-company dev
```
