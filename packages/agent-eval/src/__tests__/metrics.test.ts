import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  computeDecisionCorrect,
  computeHitRate,
  summarize,
} from '../metrics/metrics';
import type { CaseResult, TaskDistributionLike } from '../types';

function makeDecision(overrides: Partial<TaskDistributionLike>): TaskDistributionLike {
  return {
    taskDescription: '',
    needsCompanyInfo: false,
    needsGraph: false,
    needsBusiness: false,
    reasoning: '',
    ...overrides,
  };
}

describe('computeHitRate', () => {
  it('期望为空或未标注时返回 1', () => {
    expect(computeHitRate([], undefined)).toBe(1);
    expect(computeHitRate([], [])).toBe(1);
    expect(computeHitRate(['x'], [])).toBe(1);
  });

  it('部分命中返回命中比例', () => {
    expect(computeHitRate(['a', 'b'], ['a', 'b', 'c'])).toBeCloseTo(2 / 3);
  });

  it('全命中返回 1，全未命中返回 0', () => {
    expect(computeHitRate(['a', 'b', 'c'], ['a', 'b'])).toBe(1);
    expect(computeHitRate(['x'], ['a'])).toBe(0);
  });

  it('实际集合重复元素不重复计数', () => {
    expect(computeHitRate(['a', 'a', 'a'], ['a', 'b'])).toBe(0.5);
  });
});

describe('computeDecisionCorrect', () => {
  it('三个布尔完全一致时匹配', () => {
    const actual = makeDecision({ needsCompanyInfo: true, needsGraph: true });
    expect(
      computeDecisionCorrect(actual, {
        needsCompanyInfo: true,
        needsGraph: true,
        needsBusiness: false,
      }),
    ).toBe(true);
  });

  it('任一布尔不一致即不匹配', () => {
    const actual = makeDecision({ needsBusiness: true });
    expect(
      computeDecisionCorrect(actual, {
        needsCompanyInfo: false,
        needsGraph: false,
        needsBusiness: false,
      }),
    ).toBe(false);
  });
});

function makeCaseResult(overrides: Partial<CaseResult>): CaseResult {
  return {
    caseId: 'c1',
    caseName: '用例1',
    query: 'q',
    mode: 'skip-llm',
    decision: makeDecision({}),
    decisionCorrect: true,
    graph: { nodes: [], edges: [] },
    nodeHitRate: 1,
    edgeHitRate: 1,
    riskMatchRate: 1,
    durationMs: 10,
    ...overrides,
  };
}

describe('summarize', () => {
  it('正确计算准确率与平均命中率', () => {
    const results = [
      makeCaseResult({ nodeHitRate: 1 }),
      makeCaseResult({ caseId: 'c2', decisionCorrect: false, nodeHitRate: 0.5 }),
    ];
    const summary = summarize(results, 'skip-llm', DEFAULT_THRESHOLDS, 100);
    expect(summary.totalCases).toBe(2);
    expect(summary.passedCases).toBe(1);
    expect(summary.decisionAccuracy).toBe(0.5);
    expect(summary.avgNodeHitRate).toBeCloseTo(0.75);
    expect(summary.durationMs).toBe(100);
  });

  it('运行出错的用例不计入通过数', () => {
    const results = [
      makeCaseResult({ caseId: 'c1', error: 'fetch failed' }),
      makeCaseResult({ caseId: 'c2' }),
    ];
    const summary = summarize(results, 'llm');
    expect(summary.passedCases).toBe(1);
    expect(summary.decisionAccuracy).toBe(0.5);
  });

  it('决策准确率低于阈值时门禁不通过', () => {
    const results = [
      makeCaseResult({ caseId: 'c1', decisionCorrect: false }),
      makeCaseResult({ caseId: 'c2' }),
    ];
    const summary = summarize(results, 'llm');
    expect(summary.decisionAccuracy).toBe(0.5);
    expect(summary.gatesPassed).toBe(false);
  });

  it('节点命中率低于阈值时门禁不通过', () => {
    const results = [makeCaseResult({ nodeHitRate: 0.5 })];
    const summary = summarize(results, 'llm');
    expect(summary.gatesPassed).toBe(false);
  });

  it('两项指标均达标时门禁通过', () => {
    const results = [makeCaseResult({})];
    const summary = summarize(results, 'llm');
    expect(summary.gatesPassed).toBe(true);
  });

  it('空结果集返回零值且门禁不通过', () => {
    const summary = summarize([], 'llm');
    expect(summary.totalCases).toBe(0);
    expect(summary.decisionAccuracy).toBe(0);
    expect(summary.gatesPassed).toBe(false);
  });
});
