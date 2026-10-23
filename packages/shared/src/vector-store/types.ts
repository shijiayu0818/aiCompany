// 向量库抽象接口
import type { VectorDoc, VectorSearchOptions } from '../types';

export interface VectorStore {
  /** 添加文档到向量库 */
  add(docs: VectorDoc[]): Promise<void>;
  /** 语义检索 */
  search(query: string, options: VectorSearchOptions): Promise<VectorDoc[]>;
  /** 删除文档 */
  delete(ids: string[]): Promise<void>;
  /** 获取 collection 中文档数量 */
  count(collection: string): Promise<number>;
}
