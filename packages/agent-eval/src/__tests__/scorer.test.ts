import { describe, expect, it } from 'vitest';
import { mergeGraphs, scoreEnterprises } from '../scorer/scorer';
import type { GraphData, RiskItem } from '@ai/shared';
import type { EnterpriseScore } from '../types';

function makeRisk(overrides: Partial<RiskItem>): RiskItem {
  return {
    id: 'r-x',
    enterpriseId: 'e1',
    type: '行政处罚',
    level: 'yellow',
    date: '2025-01-01',
    detail: 'detail',
    source: 'test',
    ...overrides,
  };
}

const baseGraph: GraphData = {
  nodes: [
    { id: 'e1', type: 'enterprise', name: '企业一', refId: 'e1' },
    { id: 'e2', type: 'enterprise', name: '企业二', refId: 'e2' },
    { id: 'p1', type: 'person', name: '张三' },
  ],
  edges: [
    { id: 'r1', source: 'p1', target: 'e1', type: '法定代表人' },
    { id: 'r2', source: 'e1', target: 'e2', type: '投资' },
    { id: 'r3', source: 'e2', target: 'e2x', type: '投资' },
  ],
};

function findScore(scores: EnterpriseScore[], id: string): EnterpriseScore {
  const found = scores.find((s) => s.enterpriseId === id);
  if (!found) throw new Error(`未找到企业 ${id} 的评分`);
  return found;
}

describe('scoreEnterprises', () => {
  it('只对 enterprise 节点评分，跳过 person 节点', () => {
    const scores = scoreEnterprises(baseGraph, []);
    expect(scores.map((s) => s.enterpriseId).sort()).toEqual(['e1', 'e2']);
  });

  it('风险加权：red=3 / yellow=1', () => {
    const risks = [
      makeRisk({ id: 'r1', enterpriseId: 'e1', level: 'red' }),
      makeRisk({ id: 'r2', enterpriseId: 'e1', level: 'yellow' }),
    ];
    const scores = scoreEnterprises(baseGraph, risks);
    const e1 = findScore(scores, 'e1');
    expect(e1.riskScore).toBe(4);
    expect(e1.riskCount).toEqual({ red: 1, yellow: 1 });
  });

  it('风险按 enterpriseId 与 refId 精确匹配，不串企业', () => {
    const risks = [makeRisk({ enterpriseId: 'e2', level: 'red' })];
    const scores = scoreEnterprises(baseGraph, risks);
    expect(findScore(scores, 'e1').riskScore).toBe(0);
    expect(findScore(scores, 'e2').riskScore).toBe(3);
  });

  it('关联度统计企业相连边数，每边 2 分', () => {
    const scores = scoreEnterprises(baseGraph, []);
    // e1 相连边：r1、r2 → 2 条
    expect(findScore(scores, 'e1').relationDegree).toBe(2);
    expect(findScore(scores, 'e1').relationScore).toBe(4);
    // e2 相连边：r2（target）、r3（source）→ 2 条
    expect(findScore(scores, 'e2').relationDegree).toBe(2);
  });

  it('风险分封顶 70，关联分封顶 30，总分封顶 100', () => {
    const risks = Array.from({ length: 30 }, (_, i) =>
      makeRisk({ id: `rr${i}`, enterpriseId: 'e1', level: 'red' }),
    );
    const manyEdgesGraph: GraphData = {
      nodes: [
        { id: 'e1', type: 'enterprise', name: '企业一', refId: 'e1' },
        ...Array.from({ length: 20 }, (_, i) => ({
          id: `x${i}`,
          type: 'person' as const,
          name: `p${i}`,
        })),
      ],
      edges: Array.from({ length: 20 }, (_, i) => ({
        id: `er${i}`,
        source: `x${i}`,
        target: 'e1',
        type: '任职' as const,
      })),
    };
    const scores = scoreEnterprises(manyEdgesGraph, risks);
    const e1 = findScore(scores, 'e1');
    expect(e1.riskScore).toBe(70);
    expect(e1.relationScore).toBe(30);
    expect(e1.score).toBe(100);
  });

  it('等级划分边界：A<25 / B<50 / C<75 / D>=75', () => {
    const graph: GraphData = {
      nodes: [{ id: 'e1', type: 'enterprise', name: '企业一', refId: 'e1' }],
      edges: [],
    };
    const gradeOf = (redCount: number): EnterpriseScore['grade'] => {
      const risks = Array.from({ length: redCount }, (_, i) =>
        makeRisk({ id: `rd${i}`, enterpriseId: 'e1', level: 'red' }),
      );
      return findScore(scoreEnterprises(graph, risks), 'e1').grade;
    };
    // 0 red → 0 分 A；8 red → 24 分 A；9 red → 27 分 B
    expect(gradeOf(0)).toBe('A');
    expect(gradeOf(8)).toBe('A');
    expect(gradeOf(9)).toBe('B');
    // 风险封顶 70 + 关联 2 分 = 72 → C（风险单项到不了 75）
    const graphWithEdges: GraphData = {
      nodes: [
        { id: 'e1', type: 'enterprise', name: '企业一', refId: 'e1' },
        { id: 'x1', type: 'person', name: '张三' },
      ],
      edges: [{ id: 'er1', source: 'x1', target: 'e1', type: '任职' }],
    };
    const risks30 = Array.from({ length: 30 }, (_, i) =>
      makeRisk({ id: `rd30-${i}`, enterpriseId: 'e1', level: 'red' }),
    );
    const cScore = findScore(scoreEnterprises(graphWithEdges, risks30), 'e1');
    expect(cScore.score).toBe(72);
    expect(cScore.grade).toBe('C');
    // 风险 70（封顶）+ 关联 30（封顶，15 条边）= 100 → D
    const graphManyEdges: GraphData = {
      nodes: [
        { id: 'e1', type: 'enterprise', name: '企业一', refId: 'e1' },
        ...Array.from({ length: 15 }, (_, i) => ({
          id: `x${i}`,
          type: 'person' as const,
          name: `p${i}`,
        })),
      ],
      edges: Array.from({ length: 15 }, (_, i) => ({
        id: `er${i}`,
        source: `x${i}`,
        target: 'e1',
        type: '任职' as const,
      })),
    };
    const dScore = findScore(scoreEnterprises(graphManyEdges, risks30), 'e1');
    expect(dScore.score).toBe(100);
    expect(dScore.grade).toBe('D');
  });

  it('无 refId 时回退用节点 id 匹配风险', () => {
    const graph: GraphData = {
      nodes: [{ id: 'e9', type: 'enterprise', name: '企业九' }],
      edges: [],
    };
    const risks = [makeRisk({ enterpriseId: 'e9', level: 'yellow' })];
    const scores = scoreEnterprises(graph, risks);
    expect(findScore(scores, 'e9').riskScore).toBe(1);
  });
});

describe('mergeGraphs', () => {
  it('合并多个图谱并按节点 id、边 source->target:type 去重', () => {
    const g1: GraphData = {
      nodes: [{ id: 'e1', type: 'enterprise', name: '企业一', refId: 'e1' }],
      edges: [{ id: 'r1', source: 'e1', target: 'e2', type: '投资' }],
    };
    const g2: GraphData = {
      nodes: [
        { id: 'e1', type: 'enterprise', name: '企业一改名', refId: 'e1' },
        { id: 'e2', type: 'enterprise', name: '企业二', refId: 'e2' },
      ],
      edges: [
        { id: 'r1-dup', source: 'e1', target: 'e2', type: '投资' },
        { id: 'r2', source: 'e2', target: 'e1', type: '关联' },
      ],
    };
    const merged = mergeGraphs([g1, g2]);
    expect(merged.nodes.map((n) => n.id).sort()).toEqual(['e1', 'e2']);
    // 同 source->target:type 去重，保留后出现的
    expect(merged.edges).toHaveLength(2);
    expect(merged.edges.find((e) => e.source === 'e1')?.id).toBe('r1-dup');
  });

  it('空图谱列表返回空结果', () => {
    expect(mergeGraphs([])).toEqual({ nodes: [], edges: [] });
  });
});
