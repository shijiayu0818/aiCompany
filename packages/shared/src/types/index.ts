// 共享类型定义

// ===== 企业基本信息 =====
export interface Enterprise {
  id: string;
  name: string;
  creditCode: string;
  legalPerson: string;
  registeredCapital: string;
  establishDate: string;
  status: '存续' | '注销' | '吊销' | '迁入' | '迁出' | '停业' | '清算';
  industry: string;
  region: string;
  description?: string;
}

// ===== 人员 =====
export interface Person {
  id: string;
  name: string;
  position?: string;
}

// ===== 风险项 =====
export type RiskLevel = 'red' | 'yellow' | 'green';

export interface RiskItem {
  id: string;
  enterpriseId: string;
  type: string;
  level: RiskLevel;
  date: string;
  detail: string;
  source: string;
}

// ===== 图谱数据 =====
export type NodeType = 'enterprise' | 'person' | 'shareholder';
export type EdgeType = '投资' | '任职' | '控制' | '关联' | '法定代表人';

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  refId?: string;
  meta?: string;
  detail?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  label?: string;
  weight?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ===== 向量文档 =====
export interface VectorDoc {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface VectorSearchOptions {
  collection: string;
  topK: number;
}

// ===== Agent 服务请求/响应 =====
export interface AgentQueryRequest {
  query: string;
  enterpriseId?: string;
}

export interface AgentQueryResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ===== 数据源类型 =====
export type DataSource = 'mock' | 'real';
