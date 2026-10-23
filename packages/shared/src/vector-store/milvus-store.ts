// Milvus 向量库实现
// 与 Chroma 差异：Milvus 不负责向量化，需显式提供向量；
// embedding 能力依赖注入，默认走 OpenAI 兼容 /embeddings 接口。
// 环境变量延迟读取（同 chromadb/qichacha 教训：模块加载期不依赖任何配置）
import { MilvusClient, DataType, MetricType, IndexType } from '@zilliz/milvus2-sdk-node';
import type { VectorDoc, VectorSearchOptions } from '../types';
import type { VectorStore } from './types';
import { getMilvusConfig, getEmbeddingConfig } from '../api-keys';

/** 向量化函数签名 */
export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export interface MilvusStoreOptions {
  /** 自定义 embedding 实现；缺省走 OpenAI 兼容 /embeddings 接口 */
  embed?: EmbedFn;
}

const DEFAULT_COLLECTION = 'default';
const ID_MAX_LENGTH = 64;
const CONTENT_MAX_LENGTH = 8192;

/**
 * 默认 embedding：OpenAI 兼容接口（baseURL/embeddings）
 * 配置读取延迟到调用时（EMBEDDING_BASE_URL / EMBEDDING_API_KEY / EMBEDDING_MODEL）
 */
async function defaultEmbed(texts: string[]): Promise<number[][]> {
  const { baseURL, apiKey, model } = getEmbeddingConfig();
  const res = await fetch(`${baseURL.replace(/\/$/, '')}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) {
    throw new Error(`[MilvusStore] embedding 服务调用失败: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data?: { embedding: number[] }[] };
  if (!Array.isArray(json.data) || json.data.length !== texts.length) {
    throw new Error('[MilvusStore] embedding 服务返回格式异常');
  }
  return json.data.map((d) => d.embedding);
}

export class MilvusStore implements VectorStore {
  private client: MilvusClient | null = null;
  private readonly embedFn: EmbedFn;
  /** 已完成建集合 + 索引 + load 的集合缓存，避免重复确保 */
  private readonly ensured = new Set<string>();

  constructor(options: MilvusStoreOptions = {}) {
    this.embedFn = options.embed ?? defaultEmbed;
  }

  /** 懒初始化客户端（配置延迟到首次实际使用时读取） */
  private getClient(): MilvusClient {
    if (!this.client) {
      const { address, token } = getMilvusConfig();
      this.client = new MilvusClient({ address, token });
    }
    return this.client;
  }

  /** 确保集合存在、向量索引已建、集合已 load */
  private async ensureCollection(name: string, dim: number): Promise<void> {
    if (this.ensured.has(name)) return;
    const client = this.getClient();
    const { value: exists } = await client.hasCollection({ collection_name: name });
    if (!exists) {
      await client.createCollection({
        collection_name: name,
        fields: [
          {
            name: 'id',
            data_type: DataType.VarChar,
            is_primary_key: true,
            max_length: ID_MAX_LENGTH,
          },
          { name: 'content', data_type: DataType.VarChar, max_length: CONTENT_MAX_LENGTH },
          { name: 'metadata', data_type: DataType.JSON },
          { name: 'vector', data_type: DataType.FloatVector, dim },
        ],
      });
      await client.createIndex({
        collection_name: name,
        field_name: 'vector',
        index_type: IndexType.AUTOINDEX,
        metric_type: MetricType.COSINE,
      });
    }
    await client.loadCollection({ collection_name: name });
    this.ensured.add(name);
  }

  async add(docs: VectorDoc[]): Promise<void> {
    if (docs.length === 0) return;
    // 与 ChromaStore 一致：按 metadata.collection 分组入库
    const groups = new Map<string, VectorDoc[]>();
    for (const doc of docs) {
      const collection =
        typeof doc.metadata.collection === 'string'
          ? doc.metadata.collection
          : DEFAULT_COLLECTION;
      const list = groups.get(collection) ?? [];
      list.push(doc);
      groups.set(collection, list);
    }

    for (const [collection, list] of groups) {
      const vectors = await this.embedFn(list.map((d) => d.content));
      await this.ensureCollection(collection, vectors[0].length);
      await this.getClient().insert({
        collection_name: collection,
        data: list.map((doc, i) => ({
          id: doc.id,
          content: doc.content,
          metadata: doc.metadata,
          vector: vectors[i],
        })),
      });
    }
  }

  async search(query: string, options: VectorSearchOptions): Promise<VectorDoc[]> {
    const [vector] = await this.embedFn([query]);
    await this.ensureCollection(options.collection, vector.length);
    const res = await this.getClient().search({
      collection_name: options.collection,
      data: [vector],
      limit: options.topK,
      output_fields: ['content', 'metadata'],
    });

    if (res.status.error_code !== 'Success' || !Array.isArray(res.results)) {
      return [];
    }
    return res.results.map((r) => ({
      id: String(r.id),
      content: typeof r.content === 'string' ? r.content : '',
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
    }));
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const client = this.getClient();
    const { data: collections } = await client.listCollections();
    // 与 ChromaStore 一致：id 不携带集合信息，遍历所有集合删除
    const filter = `id in [${ids.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(',')}]`;
    for (const { name } of collections) {
      await client.delete({ collection_name: name, filter });
    }
  }

  async count(collection: string): Promise<number> {
    const client = this.getClient();
    const { value: exists } = await client.hasCollection({ collection_name: collection });
    if (!exists) return 0;
    const res = await client.getCollectionStatistics({ collection_name: collection });
    const rowCount = res.stats?.find((s) => s.key === 'row_count')?.value;
    return Number(rowCount ?? 0);
  }
}
