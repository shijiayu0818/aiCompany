// Chroma 向量库实现（默认）
import { ChromaClient } from 'chromadb';
import type { VectorDoc, VectorSearchOptions } from '../types';
import type { VectorStore } from './types';

type ChromaMetadata = Record<string, string | number | boolean>;

export class ChromaStore implements VectorStore {
  private client: ChromaClient;

  constructor(path = process.env.CHROMA_PATH ?? './.chroma') {
    this.client = new ChromaClient({ path });
  }

  async add(docs: VectorDoc[]): Promise<void> {
    if (docs.length === 0) return;
    const collectionName = (docs[0].metadata?.collection as string) ?? 'default';
    const collection = await this.client.getOrCreateCollection({ name: collectionName });
    await collection.add({
      ids: docs.map((d) => d.id),
      documents: docs.map((d) => d.content),
      metadatas: docs.map((d) => this.toChromaMetadata(d.metadata)),
    });
  }

  async search(query: string, options: VectorSearchOptions): Promise<VectorDoc[]> {
    const collection = await this.client.getOrCreateCollection({ name: options.collection });
    const result = await collection.query({
      queryTexts: [query],
      nResults: options.topK,
    });
    const ids = result.ids[0] ?? [];
    const documents = result.documents[0] ?? [];
    const metadatas = result.metadatas[0] ?? [];
    return ids.map((id, i) => ({
      id,
      content: documents[i] ?? '',
      metadata: (metadatas[i] as Record<string, unknown>) ?? {},
    }));
  }

  async delete(ids: string[]): Promise<void> {
    const collections = await this.client.listCollections();
    for (const colName of collections) {
      const collection = await this.client.getOrCreateCollection({ name: colName });
      await collection.delete({ ids });
    }
  }

  async count(collection: string): Promise<number> {
    const col = await this.client.getOrCreateCollection({ name: collection });
    return col.count();
  }

  private toChromaMetadata(meta: Record<string, unknown>): ChromaMetadata {
    const result: ChromaMetadata = {};
    for (const [key, value] of Object.entries(meta)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        result[key] = value;
      }
    }
    return result;
  }
}
