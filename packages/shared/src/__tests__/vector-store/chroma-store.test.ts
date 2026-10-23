import { describe, it, expect, vi, beforeEach } from 'vitest';

const chromaMocks = vi.hoisted(() => {
  const collection = {
    add: vi.fn(),
    query: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  };
  const client = {
    getOrCreateCollection: vi.fn(async () => collection),
    listCollections: vi.fn(async () => []),
  };
  return { collection, client };
});

vi.mock('chromadb', () => ({
  ChromaClient: vi.fn(() => chromaMocks.client),
}));

import { ChromaStore } from '../../vector-store/chroma-store';
import type { VectorDoc } from '../../types';

const docs: VectorDoc[] = [
  {
    id: 'doc1',
    content: '星辰智能工商文档',
    metadata: { collection: 'company-docs', region: '北京', weight: 3, nested: { a: 1 } },
  },
  { id: 'doc2', content: '风险描述', metadata: { collection: 'company-docs' } },
];

beforeEach(() => {
  chromaMocks.collection.add.mockReset();
  chromaMocks.collection.query.mockReset();
  chromaMocks.collection.delete.mockReset();
  chromaMocks.collection.count.mockReset();
  chromaMocks.client.getOrCreateCollection.mockClear();
  chromaMocks.client.listCollections.mockReset();
  chromaMocks.client.listCollections.mockResolvedValue([]);
});

describe('ChromaStore', () => {
  it('add：空数组短路不触发任何请求', async () => {
    const store = new ChromaStore();
    await store.add([]);

    expect(chromaMocks.client.getOrCreateCollection).not.toHaveBeenCalled();
  });

  it('add：按 metadata.collection 选择集合并过滤非基础类型 metadata', async () => {
    chromaMocks.client.listCollections.mockResolvedValue([]);
    const store = new ChromaStore();
    await store.add(docs);

    expect(chromaMocks.client.getOrCreateCollection).toHaveBeenCalledWith({
      name: 'company-docs',
    });
    expect(chromaMocks.collection.add).toHaveBeenCalledWith({
      ids: ['doc1', 'doc2'],
      documents: ['星辰智能工商文档', '风险描述'],
      metadatas: [
        // nested 对象被过滤，只保留 string/number/boolean
        { collection: 'company-docs', region: '北京', weight: 3 },
        { collection: 'company-docs' },
      ],
    });
  });

  it('add：无 collection 元数据时使用 default 集合', async () => {
    const store = new ChromaStore();
    await store.add([{ id: 'd1', content: 'c1', metadata: {} }]);

    expect(chromaMocks.client.getOrCreateCollection).toHaveBeenCalledWith({
      name: 'default',
    });
  });

  it('search：传递 queryTexts 与 topK 并映射结果', async () => {
    chromaMocks.collection.query.mockResolvedValue({
      ids: [['doc1', 'doc2']],
      documents: [['星辰智能工商文档', '风险描述']],
      metadatas: [[{ region: '北京' }, {}]],
    });
    const store = new ChromaStore();
    const result = await store.search('星辰智能', { collection: 'company-docs', topK: 2 });

    expect(chromaMocks.collection.query).toHaveBeenCalledWith({
      queryTexts: ['星辰智能'],
      nResults: 2,
    });
    expect(result).toEqual([
      { id: 'doc1', content: '星辰智能工商文档', metadata: { region: '北京' } },
      { id: 'doc2', content: '风险描述', metadata: {} },
    ]);
  });

  it('search：空结果映射为空数组', async () => {
    chromaMocks.collection.query.mockResolvedValue({
      ids: [[]],
      documents: [[]],
      metadatas: [[]],
    });
    const store = new ChromaStore();
    const result = await store.search('q', { collection: 'c', topK: 5 });

    expect(result).toEqual([]);
  });

  it('delete：遍历所有集合并按 ids 删除', async () => {
    chromaMocks.client.listCollections.mockResolvedValue(['colA', 'colB']);
    const store = new ChromaStore();
    await store.delete(['doc1']);

    expect(chromaMocks.client.getOrCreateCollection).toHaveBeenCalledTimes(2);
    expect(chromaMocks.collection.delete).toHaveBeenCalledTimes(2);
    expect(chromaMocks.collection.delete).toHaveBeenCalledWith({ ids: ['doc1'] });
  });

  it('count：返回集合文档数', async () => {
    chromaMocks.collection.count.mockResolvedValue(7);
    const store = new ChromaStore();
    const result = await store.count('company-docs');

    expect(chromaMocks.client.getOrCreateCollection).toHaveBeenCalledWith({
      name: 'company-docs',
    });
    expect(result).toBe(7);
  });
});
