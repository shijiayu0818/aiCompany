// @ai/agent-eval 评测核心类型
import type { GraphData } from '@ai/shared';

/**
 * Supervisor 决策的宽松形状（评测内部用）
 * 与 agent-core 的 TaskDistribution 一致，但 nullable 字段用可选表示，
 * 避免 LLM 输出 null 与 state 归一 undefined 的类型冲突
 */
export interface TaskDistributionLike {
  taskDescription: string;
  needsCompanyInfo: boolean;
  companyQuery?: string | null;
  needsGraph: boolean;
  graphQuery?: string | null;
  needsBusiness: boolean;
  businessQuery?: string | null;
  reasoning: string;
  directResponse?: string | null;
}

// ===== 评测用例 =====

/** 期望激活的 Agent 组合 */
export interface ExpectedAgents {
  needsCompanyInfo: boolean;
  needsGraph: boolean;
  needsBusiness: boolean;
}

/** 多轮对话历史消息 */
export interface EvalHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** 评测用例（Golden Set 单条） */
export interface EvalCase {
  id: string;
  /** 用例名称（报告展示用） */
  name: string;
  /** 用户查询 */
  query: string;
  /** 多轮对话历史（指代消解用例需要） */
  history?: EvalHistoryMessage[];
  /** 期望激活的 Agent 组合 */
  expectedAgents: ExpectedAgents;
  /** 期望图谱节点 id 集合（计算节点命中率） */
  expectedGraphNodes?: string[];
  /** 期望图谱边 [sourceId, targetId] 集合（计算边命中率） */
  expectedGraphEdges?: [string, string][];
  /** 期望命中的风险项 id 集合（计算风险匹配率） */
  expectedRisks?: string[];
  /**
   * --skip-llm 模式注入的 Supervisor 决策（按 case 标注）
   * 提供此字段时跳过真实 LLM 调用，直接以该决策驱动后续流程
   */
  injectedDecision?: TaskDistributionLike;
}

/** 评测数据集 */
export interface EvalDataset {
  cases: EvalCase[];
}

// ===== 运行结果 =====

/** 评测执行模式 */
export type EvalMode = 'llm' | 'skip-llm';

/** 单条用例运行结果 */
export interface CaseResult {
  caseId: string;
  caseName: string;
  query: string;
  mode: EvalMode;
  /** 实际生效的 Supervisor 决策（真实 LLM 或注入） */
  decision: TaskDistributionLike;
  /** 决策是否与期望 Agent 组合一致 */
  decisionCorrect: boolean;
  /** 组装后的图谱数据 */
  graph: GraphData;
  /** 节点命中率（0-1，无期望节点时为 1） */
  nodeHitRate: number;
  /** 边命中率（0-1，无期望边时为 1） */
  edgeHitRate: number;
  /** 风险匹配率（0-1，无期望风险时为 1） */
  riskMatchRate: number;
  /** 运行耗时 ms */
  durationMs: number;
  /** 运行错误（有错则该 case 判为失败） */
  error?: string;
}

/** 指标阈值（门禁用） */
export interface EvalThresholds {
  /** 决策准确率阈值，默认 0.8 */
  decisionAccuracy: number;
  /** 平均节点命中率阈值，默认 0.7 */
  nodeHitRate: number;
}

/** 评测汇总结果 */
export interface EvalSummary {
  mode: EvalMode;
  totalCases: number;
  passedCases: number;
  /** 决策准确率（0-1） */
  decisionAccuracy: number;
  /** 平均节点命中率（0-1） */
  avgNodeHitRate: number;
  /** 平均边命中率（0-1） */
  avgEdgeHitRate: number;
  /** 平均风险匹配率（0-1） */
  avgRiskMatchRate: number;
  /** 总耗时 ms */
  durationMs: number;
  thresholds: EvalThresholds;
  /** 门禁是否通过（决策准确率与节点命中率均达标） */
  gatesPassed: boolean;
}

/** 完整评测报告数据 */
export interface EvalReport {
  summary: EvalSummary;
  cases: CaseResult[];
  generatedAt: string;
}

// ===== 企业评分 =====

/** 企业评分等级 */
export type EnterpriseGrade = 'A' | 'B' | 'C' | 'D';

/** 单个企业的风险评分结果 */
export interface EnterpriseScore {
  enterpriseId: string;
  name: string;
  /** 综合分 0-100（越高风险越大） */
  score: number;
  grade: EnterpriseGrade;
  /** 风险分项（red=3/条 yellow=1/条，封顶 70） */
  riskScore: number;
  /** 图谱关联度分项（每条关联边 2 分，封顶 30） */
  relationScore: number;
  riskCount: { red: number; yellow: number };
  /** 图谱中与其它实体的关联边数 */
  relationDegree: number;
}
