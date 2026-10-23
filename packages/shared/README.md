# @ai/shared

公共能力层：全仓共享的类型定义、密钥管理、数据源与存储封装。所有应用与包从这里引用公共能力，禁止业务代码绕过本包直连外部服务。

## 模块清单

| 模块 | 路径 | 说明 |
|---|---|---|
| types | `src/types` | 全仓类型：`GraphNode`/`GraphEdge`/`GraphData`、`VectorDoc`、企业/风险实体 |
| api-keys | `src/api-keys` | 环境变量密钥读取（LLM、企查查、Neo4j），禁止各应用分散配置 |
| mock-data | `src/mock-data` | 开发阶段数据源：5 家虚构企业、关联关系、风险条目 |
| vector-store | `src/vector-store` | 向量库抽象：`VectorStore` 接口 + Chroma 实现 + Milvus 实现 |
| neo4j | `src/neo4j` | 图数据库封装，业务代码禁止直写 Cypher |
| qichacha | `src/qichacha` | 企查查预警通客户端，`DATA_SOURCE=real` 时启用 |

## 切换策略

- 数据源：环境变量 `DATA_SOURCE=mock|real`，业务代码零改动（mock 模式不依赖任何 API Key）
- 向量库：环境变量 `VECTOR_BACKEND=chroma|milvus`，经 `createVectorStore()` 工厂创建，只依赖 `VectorStore` 抽象接口（add/search/delete/count）
- 向量持久化目录 `.chroma/` 不入 git

### Milvus 后端

`VECTOR_BACKEND=milvus` 时需额外配置（均为延迟读取，不配置不影响 chroma 路径）：

| 变量 | 说明 |
|---|---|
| `MILVUS_URI` | Milvus 地址，如 `localhost:19530` 或 Zilliz Cloud endpoint |
| `MILVUS_TOKEN` | 认证 token（可选，本地部署通常不需要） |
| `EMBEDDING_BASE_URL` | embedding 服务地址（OpenAI 兼容 `/embeddings` 接口） |
| `EMBEDDING_API_KEY` | embedding 服务密钥 |
| `EMBEDDING_MODEL` | embedding 模型，默认 `text-embedding-3-small` |

与 Chroma 的关键差异：Milvus 不负责向量化，文档/查询文本需经 embedding 服务转向量后入库。`MilvusStore` 构造函数支持注入自定义 `embed` 实现（如本地模型），缺省走上述 OpenAI 兼容接口。Schema：`id VarChar(64) PK + content VarChar + metadata JSON + vector FloatVector`，集合不存在时自动建集合并建 AUTOINDEX（COSINE）索引。

## 测试

```bash
pnpm --filter @ai/shared test
```

覆盖：向量库工厂优先级（参数 > 环境变量 > 默认 chroma）、Chroma 全方法逻辑（mock chromadb）、Milvus 全方法逻辑与默认 embed 接口（mock @zilliz/milvus2-sdk-node + fetch）。
