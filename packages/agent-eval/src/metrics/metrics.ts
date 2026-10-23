// 评测指标计算：决策准确率 / 图谱节点与边命中率 / 风险匹配率 / 汇总门禁
import type {
  CaseResult,
  EvalMode,
  EvalSummary,
  EvalThresholds,
  ExpectedAgents,
  TaskDistributionLike,
} from '../types';

/** 指标阈值默认值（门禁：决策准确率 ≥0.8 且节点命中率 ≥0.7） */
export const DEFAULT_THRESHOLDS: EvalThresholds = {
  decisionAccuracy: 0.8,
  nodeHitRate: 0.7,
};

/**
 * 通用集合命中率：|实际 ∩ 期望| / |期望|
 * 无期望集合（未标注）时视为 1，不拖累均值
 */
export function computeHitRate(actual: string[], expected?: string[]): number {
  if (!expected || expected.length === 0) return 1;
  const actualSet = new Set(actual);
  const hit = expected.filter((e) => actualSet.has(e)).length;
  return hit / expected.length;
}

/**
 * 决策是否匹配期望：三个 Agent 激活布尔必须完全一致
 */
export function computeDecisionCorrect(
  actual: TaskDistributionLike,
  expected: ExpectedAgents,
): boolean {
  return (
    actual.needsCompanyInfo === expected.needsCompanyInfo &&
    actual.needsGraph === expected.needsGraph &&
    actual.needsBusiness === expected.needsBusiness
  );
}

/**
 * 汇总单条用例结果 → EvalSummary
 * 门禁：决策准确率与平均节点命中率同时达标才通过
 */
export function summarize(
  results: CaseResult[],
  mode: EvalMode,
  thresholds: EvalThresholds = DEFAULT_THRESHOLDS,
  durationMs = 0,
): EvalSummary {
  const total = results.length;
  const avg = (pick: (r: CaseResult) => number) =>
    total === 0 ? 0 : results.reduce((sum, r) => sum + pick(r), 0) / total;

  const passedCases = results.filter((r) => r.decisionCorrect && !r.error).length;
  const decisionAccuracy = total === 0 ? 0 : passedCases / total;
  const avgNodeHitRate = avg((r) => r.nodeHitRate);
  const avgEdgeHitRate = avg((r) => r.edgeHitRate);
  const avgRiskMatchRate = avg((r) => r.riskMatchRate);

  return {
    mode,
    totalCases: total,
    passedCases,
    decisionAccuracy,
    avgNodeHitRate,
    avgEdgeHitRate,
    avgRiskMatchRate,
    durationMs,
    thresholds,
    gatesPassed:
      decisionAccuracy >= thresholds.decisionAccuracy &&
      avgNodeHitRate >= thresholds.nodeHitRate,
  };
}
