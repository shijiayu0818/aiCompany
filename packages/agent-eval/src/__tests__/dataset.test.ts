import { describe, expect, it } from 'vitest';
import { expectedGraphFor, loadDataset } from '../dataset/dataset';

describe('loadDataset', () => {
  const dataset = loadDataset();

  it('生成 5 家企业 × 3 类用例 + 4 条手工边界用例', () => {
    expect(dataset.cases).toHaveLength(19);
    const generated = dataset.cases.filter((c) => c.id.startsWith('mock-'));
    expect(generated).toHaveLength(15);
    const manual = dataset.cases.filter((c) => c.id.startsWith('manual-'));
    expect(manual).toHaveLength(4);
  });

  it('自动用例 id 无重复且每条都有注入决策（skip-llm 必需）', () => {
    const ids = dataset.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of dataset.cases) {
      expect(c.injectedDecision, `用例 ${c.id} 缺少 injectedDecision`).toBeDefined();
    }
  });

  it('自动用例按类型标注正确的期望 Agent 组合', () => {
    const companyCase = dataset.cases.find((c) => c.id === 'mock-e1-company');
    expect(companyCase?.expectedAgents).toEqual({
      needsCompanyInfo: true,
      needsGraph: false,
      needsBusiness: false,
    });
    const graphCase = dataset.cases.find((c) => c.id === 'mock-e1-graph');
    expect(graphCase?.expectedAgents).toEqual({
      needsCompanyInfo: false,
      needsGraph: true,
      needsBusiness: false,
    });
    const businessCase = dataset.cases.find((c) => c.id === 'mock-e1-business');
    expect(businessCase?.expectedAgents).toEqual({
      needsCompanyInfo: false,
      needsGraph: false,
      needsBusiness: true,
    });
  });

  it('e1 风险用例期望命中 risk1 与 risk2', () => {
    const businessCase = dataset.cases.find((c) => c.id === 'mock-e1-business');
    expect(businessCase?.expectedRisks).toEqual(['risk1', 'risk2']);
  });

  it('手工边界用例齐全：指代消解 / 模糊查询 / 空查询 / 综合查询', () => {
    const ids = dataset.cases.map((c) => c.id);
    expect(ids).toContain('manual-coref-1');
    expect(ids).toContain('manual-vague-1');
    expect(ids).toContain('manual-empty-1');
    expect(ids).toContain('manual-all-1');
  });

  it('指代消解用例携带历史消息与显式注入决策（企业名已解析）', () => {
    const coref = dataset.cases.find((c) => c.id === 'manual-coref-1');
    expect(coref?.history?.length).toBeGreaterThan(0);
    expect(coref?.injectedDecision?.businessQuery).toContain('星辰智能科技集团');
  });
});

describe('expectedGraphFor', () => {
  it('e1 的期望子图与 getRelations 算法一致', () => {
    const expected = expectedGraphFor('e1');
    expect(expected.nodes.sort()).toEqual(['e1', 'e2', 'e3', 'e4', 'p1'].sort());
    expect(expected.edges).toHaveLength(6);
  });

  it('孤立企业返回仅自身节点且无边', () => {
    const expected = expectedGraphFor('e-nonexist');
    expect(expected.nodes).toEqual(['e-nonexist']);
    expect(expected.edges).toEqual([]);
  });
});
