import { describe, it, expect, vi, beforeEach } from 'vitest';

const sdk = vi.hoisted(() => {
  const client = {
    hasCollection: vi.fn(),
    createCollection: vi.fn(),
    createIndex: vi.fn(),
    loadCollection: vi.fn(),
    insert: vi.fn(),
    search: vi.fn(),
    delete: vi.fn(),
    listCollections: vi.fn(),
    getCollectionStatistics: vi.fn(),
  };
  return {
    client,
    MilvusClient: vi.fn(() => client),
  };
});

vi.mock('@zilliz/milvus2-sdk-node', () => ({
  MilvusClient: sdk.MilvusClient,
  DataType: { VarChar: 'VarChar', JSON: 'JSON', FloatVector: 'FloatVector' },
  MetricType: { COSINE: 'COSINE' },
  IndexType: { AUTOINDEX: 'AUTOINDEX' },
}));

import { MilvusStore } from '../../vector-store/milvus-store';
import type { VectorDoc } from '../../types';

/** 固定 3 维向量，content 长度映射维度值，便于断言 */
const fakeEmbed = vi.fn(async (texts: string[]) =>
  texts.map(() => [0.1, 0.2, 0.3]),
);

const docs: VectorDoc[] = [
  { id: 'doc1', content: '星辰智能工商文档', metadata: { collection: 'company-docs', region: '北京' } },
  { id: 'doc2', content: '风险描述', metadata: { collection: 'company-docs' } },
  { id: 'doc3', content: '其他文档', metadata: {} },
];

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.stubEnv('MILVUS_URI', 'localhost:19530');
  for (const fn of Object.values(sdk.client)) fn.mockReset();
  sdk.MilvusClient.mockClear();
  sdk.client.hasCollection.mockResolvedValue({ value: true });
  sdk.client.listCollections.mockResolvedValue({ data: [{ name: 'company-docs' }] });
  fakeEmbed.mockClear();
});

describe('MilvusStore', () => {
  describe('add', () => {
    it('空数组短路：不 embed、不建集合、不请求', async () => {
      const store = new MilvusStore({ embed: fakeEmbed });
      await store.add([]);

      expect(fakeEmbed).not.toHaveBeenCalled();
      expect(sdk.MilvusClient).not.toHaveBeenCalled();
    });

    it('按 metadata.collection 分组入库，无 collection 走 default', async () => {
      const store = new MilvusStore({ embed: fakeEmbed });
      await store.add(docs);

      const inserted = sdk.client.insert.mock.calls.map((c) => c[0]);
      const byCollection = Object.fromEntries(
        inserted.map((c) => [c.collection_name, c.data.map((d: { id: string }) => d.id)]),
      );
      expect(byCollection['company-docs']).toEqual(['doc1', 'doc2']);
      expect(byCollection['default']).toEqual(['doc3']);
    });

    it('首次使用：embedding 后 insert，向量维度透传', async () => {
      const store = new MilvusStore({ embed: fakeEmbed });
      await store.add([docs[0]]);

      expect(fakeEmbed).toHaveBeenCalledWith(['星辰智能工商文档']);
      const insertArg = sdk.client.insert.mock.calls[0][0];
      expect(insertArg.data[0]).toEqual({
        id: 'doc1',
        content: '星辰智能工商文档',
        metadata: { collection: 'company-docs', region: '北京' },
        vector: [0.1, 0.2, 0.3],
      });
    });

    it('集合不存在时自动建集合 + 建索引 + load', async () => {
      sdk.client.hasCollection.mockResolvedValue({ value: false });
      const store = new MilvusStore({ embed: fakeEmbed });
      await store.add([docs[0]]);

      expect(sdk.client.createCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          collection_name: 'company-docs',
          fields: expect.arrayContaining([
            expect.objectContaining({ name: 'id', is_primary_key: true }),
            expect.objectContaining({ name: 'vector', dim: 3 }),
          ]),
        }),
      );
      expect(sdk.client.createIndex).toHaveBeenCalledWith(
        expect.objectContaining({ collection_name: 'company-docs', field_name: 'vector' }),
      );
      expect(sdk.client.loadCollection).toHaveBeenCalledWith({ collection_name: 'company-docs' });
    });

    it('已存在的集合不重复建，且同实例内只确保一次', async () => {
      const store = new MilvusStore({ embed: fakeEmbed });
      await store.add([docs[0]]);
      await store.add([docs[1]]);

      expect(sdk.client.createCollection).not.toHaveBeenCalled();
      expect(sdk.client.hasCollection).toHaveBeenCalledTimes(1);
    });

    it('未配置 MILVUS_URI 时实际调用才报错（延迟读取）', async () => {
      vi.stubEnv('MILVUS_URI', '');
      const store = new MilvusStore({ embed: fakeEmbed });

      await expect(store.add([docs[0]])).rejects.toThrow(/MILVUS_URI/);
    });
  });

  describe('search', () => {
    it('embed 查询文本后 search，映射结果', async () => {
      sdk.client.search.mockResolvedValue({
        status: { error_code: 'Success' },
        results: [
          { id: 'doc1', content: '星辰智能工商文档', metadata: { region: '北京' }, score: 0.9 },
          { id: 'doc2', content: '风险描述', metadata: {}, score: 0.8 },
        ],
      });
      const store = new MilvusStore({ embed: fakeEmbed });
      const result = await store.search('星辰智能', { collection: 'company-docs', topK: 2 });

      expect(sdk.client.search).toHaveBeenCalledWith({
        collection_name: 'company-docs',
        data: [[0.1, 0.2, 0.3]],
        limit: 2,
        output_fields: ['content', 'metadata'],
      });
      expect(result).toEqual([
        { id: 'doc1', content: '星辰智能工商文档', metadata: { region: '北京' } },
        { id: 'doc2', content: '风险描述', metadata: {} },
      ]);
    });

    it('Milvus 返回非 Success 时降级为空数组', async () => {
      sdk.client.search.mockResolvedValue({
        status: { error_code: 'UnexpectedError' },
        results: [],
      });
      const store = new MilvusStore({ embed: fakeEmbed });

      expect(await store.search('q', { collection: 'c', topK: 5 })).toEqual([]);
    });

    it('metadata 缺失时回退为空对象', async () => {
      sdk.client.search.mockResolvedValue({
        status: { error_code: 'Success' },
        results: [{ id: 1 }],
      });
      const store = new MilvusStore({ embed: fakeEmbed });
      const result = await store.search('q', { collection: 'c', topK: 5 });

      expect(result).toEqual([{ id: '1', content: '', metadata: {} }]);
    });
  });

  describe('delete', () => {
    it('空数组短路', async () => {
      const store = new MilvusStore({ embed: fakeEmbed });
      await store.delete([]);

      expect(sdk.MilvusClient).not.toHaveBeenCalled();
    });

    it('遍历所有集合按 id 过滤删除', async () => {
      sdk.client.listCollections.mockResolvedValue({
        data: [{ name: 'colA' }, { name: 'colB' }],
      });
      const store = new MilvusStore({ embed: fakeEmbed });
      await store.delete(['doc1', 'doc2']);

      expect(sdk.client.delete).toHaveBeenCalledTimes(2);
      expect(sdk.client.delete).toHaveBeenCalledWith({
        collection_name: 'colA',
        filter: 'id in ["doc1","doc2"]',
      });
      expect(sdk.client.delete).toHaveBeenCalledWith({
        collection_name: 'colB',
        filter: 'id in ["doc1","doc2"]',
      });
    });
  });

  describe('count', () => {
    it('集合存在时返回 row_count', async () => {
      sdk.client.getCollectionStatistics.mockResolvedValue({
        stats: [{ key: 'row_count', value: '42' }],
      });
      const store = new MilvusStore({ embed: fakeEmbed });

      expect(await store.count('company-docs')).toBe(42);
    });

    it('集合不存在时返回 0 且不查统计', async () => {
      sdk.client.hasCollection.mockResolvedValue({ value: false });
      const store = new MilvusStore({ embed: fakeEmbed });

      expect(await store.count('missing')).toBe(0);
      expect(sdk.client.getCollectionStatistics).not.toHaveBeenCalled();
    });

    it('row_count 缺失时返回 0', async () => {
      sdk.client.getCollectionStatistics.mockResolvedValue({ stats: [] });
      const store = new MilvusStore({ embed: fakeEmbed });

      expect(await store.count('company-docs')).toBe(0);
    });
  });

  describe('默认 embed（OpenAI 兼容接口）', () => {
    it('调用 {baseURL}/embeddings 并解析 data[].embedding', async () => {
      vi.stubEnv('EMBEDDING_BASE_URL', 'https://api.test.com/v1/');
      vi.stubEnv('EMBEDDING_API_KEY', 'test-key');
      vi.stubEnv('EMBEDDING_MODEL', 'test-model');
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: [1, 2, 3] }] }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const store = new MilvusStore();
      await store.add([docs[0]]);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
        }),
      );
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        model: 'test-model',
        input: ['星辰智能工商文档'],
      });
      expect(sdk.client.insert.mock.calls[0][0].data[0].vector).toEqual([1, 2, 3]);
    });

    it('未配置 EMBEDDING_* 时调用才报错（延迟读取）', async () => {
      const store = new MilvusStore();

      await expect(store.add([docs[0]])).rejects.toThrow(/EMBEDDING_BASE_URL/);
      expect(sdk.MilvusClient).not.toHaveBeenCalled();
    });

    it('embedding 服务 HTTP 错误时抛出明确信息', async () => {
      vi.stubEnv('EMBEDDING_BASE_URL', 'https://api.test.com/v1');
      vi.stubEnv('EMBEDDING_API_KEY', 'test-key');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

      const store = new MilvusStore();
      await expect(store.add([docs[0]])).rejects.toThrow(/HTTP 500/);
    });

    it('embedding 返回数量不匹配时抛出格式异常', async () => {
      vi.stubEnv('EMBEDDING_BASE_URL', 'https://api.test.com/v1');
      vi.stubEnv('EMBEDDING_API_KEY', 'test-key');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      }));

      const store = new MilvusStore();
      await expect(store.add([docs[0]])).rejects.toThrow(/返回格式异常/);
    });
  });
});
