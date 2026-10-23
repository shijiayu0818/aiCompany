// @ai/agent-eval 评测包：Golden Set 数据集 / 双模式执行器 / 指标 / 企业评分 / HTML 报告

// Types
export type {
  EvalCase,
  EvalDataset,
  EvalHistoryMessage,
  ExpectedAgents,
  TaskDistributionLike,
  EvalMode,
  CaseResult,
  EvalThresholds,
  EvalSummary,
  EvalReport,
  EnterpriseGrade,
  EnterpriseScore,
} from './types';

// Dataset
export { loadDataset, expectedGraphFor } from './dataset/dataset';

// Runner
export { runCase, runDataset, extractRiskIds } from './runner/runner';

// Metrics
export { DEFAULT_THRESHOLDS, computeHitRate, computeDecisionCorrect, summarize } from './metrics/metrics';

// Scorer
export { scoreEnterprises, mergeGraphs } from './scorer/scorer';

// Report
export { renderReport } from './report/report';
