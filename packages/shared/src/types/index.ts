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

// ===== 企业变更记录 =====
export type ChangeType =
  | '法定代表人变更'
  | '股东变更'
  | '注册资本变更'
  | '经营范围变更'
  | '地址变更'
  | '名称变更';

export interface EntityChange {
  id: string;
  enterpriseId: string;
  type: ChangeType;
  date: string;
  before?: string;
  after?: string;
}

// ===== 变更预警 =====
export type RiskFlagCode =
  | 'FREQUENT_CHANGE'
  | 'FREQUENT_LEGAL_PERSON'
  | 'FREQUENT_SHAREHOLDER';

export interface RiskFlag {
  code: RiskFlagCode;
  label: string;
  level: 'red' | 'yellow';
  detail: string;
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

// ===== 企业网络舆情 =====
export type OpinionSentiment = 'positive' | 'neutral' | 'negative';

export interface PublicOpinionItem {
  id: string;
  enterpriseId: string;
  title: string;
  summary: string;
  sentiment: OpinionSentiment;
  source: string;
  date: string;
  url?: string;
}

// ===== 财务快照 =====
export interface FinancialSnapshot {
  enterpriseId: string;
  year: number;
  revenue: string;
  netProfit: string;
  totalAssets: string;
  totalLiabilities: string;
  /** 资产负债率（0-100） */
  debtRatio: number;
  cashFlow: string;
  currency: string;
}

// ===== 企业需求 =====
export type BusinessNeedType =
  | '融资需求'
  | '数字化转型'
  | '供应链合作'
  | '人才招聘'
  | '市场拓展'
  | '合规咨询';

export interface BusinessNeed {
  id: string;
  enterpriseId: string;
  type: BusinessNeedType;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  budget?: string;
  deadline?: string;
}

// ===== 企业信息 Agent 返回（含变更记录与预警） =====
export interface EnterpriseDetail extends Enterprise {
  changeHistory: EntityChange[];
  riskFlags: RiskFlag[];
}

// ===== 工商资料 Agent 返回 =====
export interface BusinessQueryResult {
  risks: RiskItem[];
  needs: BusinessNeed[];
  opinions: PublicOpinionItem[];
  financials: FinancialSnapshot[];
}

// ===== 关联企业 =====
export interface RelatedEnterprise {
  id: string;
  name: string;
  relation: EdgeType | '间接关联';
  label?: string;
  industry?: string;
  region?: string;
}

// ===== 风险评级 =====
export type RiskGrade = 'A' | 'B' | 'C' | 'D';

export interface RiskAssessment {
  level: RiskLevel;
  grade: RiskGrade;
  /** 风险指数 0-100，越高风险越大 */
  score: number;
  redCount: number;
  yellowCount: number;
  summary: string;
}

// ===== 企业整体查询报告 =====
export interface EnterpriseReport {
  enterprise: Enterprise;
  changes: EntityChange[];
  flags: RiskFlag[];
  relatedEnterprises: RelatedEnterprise[];
  riskAssessment: RiskAssessment;
  risks: RiskItem[];
  needs: BusinessNeed[];
  opinions: PublicOpinionItem[];
  financials: FinancialSnapshot[];
  generatedAt: string;
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
