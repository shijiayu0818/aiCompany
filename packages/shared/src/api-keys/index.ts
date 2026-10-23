// API Key 统一管理
// 所有密钥从环境变量读取，禁止在业务代码中硬编码

export type ApiKeyName =
  | 'LLM_API_KEY'
  | 'QICHACHA_API_KEY'
  | 'NEO4J_URI'
  | 'NEO4J_USER'
  | 'NEO4J_PASSWORD';

/**
 * 获取指定名称的 API Key
 * @throws 如果 key 不存在则抛出明确错误
 */
export function getApiKey(name: ApiKeyName): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[api-keys] 环境变量 ${name} 未配置。请在 .env.local 中设置该变量。`,
    );
  }
  return value;
}

/**
 * 安全获取 API Key，不存在时返回默认值
 */
export function getApiKeySafe(name: ApiKeyName, defaultValue = ''): string {
  return process.env[name] ?? defaultValue;
}

/**
 * 检查所有必需的 API Key 是否已配置
 * @returns 缺失的 key 名称列表
 */
export function checkRequiredKeys(names: ApiKeyName[]): string[] {
  return names.filter((name) => !process.env[name]);
}

// ===== LLM 配置 =====
export interface LLMConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export function getLLMConfig(): LLMConfig {
  return {
    apiKey: getApiKey('LLM_API_KEY'),
    baseURL: process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/v1',
    model: process.env.LLM_MODEL ?? 'deepseek-chat',
  };
}

// ===== 企查查配置 =====
export interface QichachaConfig {
  apiKey: string;
  baseURL: string;
}

export function getQichachaConfig(): QichachaConfig {
  return {
    apiKey: getApiKey('QICHACHA_API_KEY'),
    baseURL: process.env.QICHACHA_BASE_URL ?? 'https://api.qichacha.com',
  };
}

// ===== Neo4j 配置 =====
export interface Neo4jConfig {
  uri: string;
  user: string;
  password: string;
}

export function getNeo4jConfig(): Neo4jConfig {
  return {
    uri: getApiKey('NEO4J_URI'),
    user: getApiKey('NEO4J_USER'),
    password: getApiKey('NEO4J_PASSWORD'),
  };
}

// ===== Milvus 配置 =====
export interface MilvusConfig {
  /** Milvus 服务地址，如 localhost:19530 或 https://xxx.cloud.zilliz.com */
  address: string;
  /** 认证 token（可选，本地部署通常不需要；Zilliz Cloud 必填） */
  token?: string;
}

/**
 * Milvus 配置（延迟读取：仅在 VECTOR_BACKEND=milvus 实际调用时触发）
 */
export function getMilvusConfig(): MilvusConfig {
  const address = process.env.MILVUS_URI;
  if (!address) {
    throw new Error(
      '[api-keys] VECTOR_BACKEND=milvus 需要配置 MILVUS_URI（如 localhost:19530）。',
    );
  }
  return {
    address,
    token: process.env.MILVUS_TOKEN || undefined,
  };
}

// ===== Embedding 配置 =====
// Milvus 不负责向量化，需独立的 embedding 服务（OpenAI 兼容 /embeddings 接口）
export interface EmbeddingConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

/**
 * Embedding 配置（延迟读取：仅 Milvus 后端实际使用时触发）
 */
export function getEmbeddingConfig(): EmbeddingConfig {
  const baseURL = process.env.EMBEDDING_BASE_URL;
  const apiKey = process.env.EMBEDDING_API_KEY;
  if (!baseURL || !apiKey) {
    throw new Error(
      '[api-keys] Milvus 后端需要 embedding 服务，请配置 EMBEDDING_BASE_URL 与 EMBEDDING_API_KEY（OpenAI 兼容 /embeddings 接口）。',
    );
  }
  return {
    baseURL,
    apiKey,
    model: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
  };
}
