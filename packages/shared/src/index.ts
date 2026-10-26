// @ai/shared 公共能力层
// 包含：api-keys / types / mock-data / vector-store / neo4j / qichacha

export const SHARED_VERSION = '0.0.1';

// ===== 类型 =====
export * from './types';

// ===== API Key 管理 =====
export {
  getApiKey,
  getApiKeySafe,
  checkRequiredKeys,
  getLLMConfig,
  getQichachaConfig,
  getNeo4jConfig,
  getDataSource,
} from './api-keys';
export type {
  ApiKeyName,
  LLMConfig,
  QichachaConfig,
  Neo4jConfig,
  DataSourceMode,
  DataSourceScope,
} from './api-keys';

// ===== 企查查 MCP 客户端 =====
export {
  listQccTools,
  callQccTool,
  closeQccClients,
} from './mcp/qcc-client';
export type { QccServerName, QccToolInfo } from './mcp/qcc-client';

// ===== Mock 数据 =====
export {
  mockCompanies,
  mockRelations,
  mockRisks,
  mockChanges,
  mockOpinions,
  mockFinancials,
  mockNeeds,
  searchEnterprises,
  getEnterpriseById,
  getRelations,
  getRisksByEnterprise,
  getChangesByEnterprise,
  getOpinionsByEnterprise,
  getFinancialsByEnterprise,
  getNeedsByEnterprise,
} from './mock-data';

// ===== 变更预警 =====
export { computeRiskFlags } from './risk/change-alert';

// ===== 企业名匹配 =====
export { matchEnterpriseByQuery } from './enterprise-match';

// ===== 向量库 =====
export { createVectorStore } from './vector-store';
export type { VectorStore } from './vector-store';
export type { VectorBackend } from './vector-store/factory';

// ===== Neo4j =====
export { neo4jStore, Neo4jStore } from './neo4j';

// ===== 企查查 =====
export { qichachaClient, QichachaClient } from './qichacha';
