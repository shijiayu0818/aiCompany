// Milvus 真实连通性集成测试
// 默认跳过（CI 无 Milvus 服务）；本地启动 Milvus 后设置环境变量运行：
//   $env:MILVUS_URI='localhost:19530'
//   pnpm --filter @ai/shared exec vitest run src/__tests__/integration/milvus.integration.test.ts
// 注意：需本机 Milvus 可达；embedding 用确定性哈希向量注入，不依赖外部 embedding 服务
import { describe, it, expect, afterAll } from 'vitest';
import { MilvusClient } from '@zilliz/milvus2-sdk-node';
import { MilvusStore } from '../../vector-store/milvus-store';
import type { VectorDoc } from '../../types';

const MILVUS_URI = process.env.MILVUS_URI;
const COLLECTION = `it-milvus-${Date.now()}`;

/** 确定性 8 维向量：同文本同向量，不同文本向量可分（连通性测试不追求语义相似） */
function hashEmbed(texts: string[]): Promise<number[][]> {
  return Promise.resolve(texts.map((t) => {
    const v = new Array(8).fill(0);
    for (let i = 0; i < t.length; i++) {
      v[i % 8] += (t.charCodeAt(i) % 97) / 97;
    }
    return v;
  }));
}

const docs: VectorDoc[] = [
  {
    id: 'doc-a',
    content: '星辰智能科技集团工商信息文档',
    metadata: { collection: COLLECTION, type: '工商' },
  },
  {
    id: 'doc-b',
    content: '云链数据科技有限公司风险描述',
    metadata: { collection: COLLECTION, type: '风险' },
  },
  {
    id: 'doc-c',
    content: '鸿图资本管理有限公司投资关系',
    metadata: { collection: COLLECTION, type: '投资' },
  },
];

describe.skipIf(!MILVUS_URI)('MilvusStore 真实连通性（本地 Milvus standalone）', () => {
  const store = new MilvusStore({ embed: hashEmbed });
  // 惰性构造：describe callback 在收集期执行，skipIf 生效时不能在此 new MilvusClient
  let client: MilvusClient | undefined;

  function getClient(): MilvusClient {
    if (!client) {
      client = new MilvusClient({ address: MILVUS_URI! });
    }
    return client;
  }

  afterAll(async () => {
    if (!client) return;
    await client.dropCollection({ collection_name: COLLECTION });
    await client.closeConnection();
  });

  it('服务连通：listCollections 可调用', async () => {
    const res = await getClient().listCollections();
    expect(res.status.error_code).toBe('Success');
  });

  it('add：真实写入 3 篇文档（自动建集合）', async () => {
    await store.add(docs);
    const count = await store.count(COLLECTION);
    expect(count).toBe(3);
  });

  it('search：相同文本向量命中自身为 top1', async () => {
    const result = await store.search('云链数据科技有限公司风险描述', {
      collection: COLLECTION,
      topK: 3,
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe('doc-b');
    expect(result[0].content).toContain('云链数据');
    expect(result[0].metadata).toMatchObject({ type: '风险' });
  });

  it('delete：删除后 count 归零', async () => {
    await store.delete(['doc-a', 'doc-b', 'doc-c']);
    const count = await store.count(COLLECTION);
    expect(count).toBe(0);
  });
});
