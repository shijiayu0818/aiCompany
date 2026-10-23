import { describe, it, expect, vi, afterEach } from 'vitest';
import { createVectorStore } from '../../vector-store/factory';
import { ChromaStore } from '../../vector-store/chroma-store';
import { MilvusStore } from '../../vector-store/milvus-store';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('createVectorStore 工厂优先级', () => {
  it('显式 backend 参数优先于环境变量', () => {
    vi.stubEnv('VECTOR_BACKEND', 'milvus');
    expect(createVectorStore('chroma')).toBeInstanceOf(ChromaStore);
  });

  it('无参数时读取 VECTOR_BACKEND 环境变量', () => {
    vi.stubEnv('VECTOR_BACKEND', 'milvus');
    expect(createVectorStore()).toBeInstanceOf(MilvusStore);
  });

  it('环境变量未设置时默认 chroma', () => {
    vi.stubEnv('VECTOR_BACKEND', '');
    expect(createVectorStore()).toBeInstanceOf(ChromaStore);
  });

  it('未知 backend 回退 chroma', () => {
    expect(createVectorStore('unknown' as never)).toBeInstanceOf(ChromaStore);
  });
});
