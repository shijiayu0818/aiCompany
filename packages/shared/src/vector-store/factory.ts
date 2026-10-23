// 向量库工厂：根据环境变量 VECTOR_BACKEND 创建实例
import type { VectorStore } from './types';
import { ChromaStore } from './chroma-store';
import { MilvusStore } from './milvus-store';

export type VectorBackend = 'chroma' | 'milvus';

/**
 * 创建向量库实例
 * 通过环境变量 VECTOR_BACKEND 切换后端，业务代码零改动
 */
export function createVectorStore(backend?: VectorBackend): VectorStore {
  const store = backend ?? (process.env.VECTOR_BACKEND as VectorBackend) ?? 'chroma';
  switch (store) {
    case 'milvus':
      return new MilvusStore();
    case 'chroma':
    default:
      return new ChromaStore();
  }
}
