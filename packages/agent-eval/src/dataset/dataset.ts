// 评测数据集：mock 自动生成批量用例 + golden-set.json 手工边界用例
// skip-llm 模式的注入决策：用例标注 injectedDecision 时直接使用，
// 否则按 expectedAgents 自动合成（query 透传给对应 Agent）
import { mockCompanies, mockRelations, mockRisks } from '@ai/shared';
import type {
  EvalCase,
  EvalDataset,
  ExpectedAgents,
  TaskDistributionLike,
} from '../types';
import goldenSetJson from './golden-set.json';

/** 按 expectedAgents 自动合成注入决策（skip-llm 默认行为） */
function synthesizeDecision(expectedAgents: ExpectedAgents, query: string): TaskDistributionLike {
  const base: TaskDistributionLike = {
    taskDescription: query || '（空查询）',
    needsCompanyInfo: expectedAgents.needsCompanyInfo,
    companyQuery: expectedAgents.needsCompanyInfo ? query : null,
    needsGraph: expectedAgents.needsGraph,
    graphQuery: expectedAgents.needsGraph ? query : null,
    needsBusiness: expectedAgents.needsBusiness,
    businessQuery: expectedAgents.needsBusiness ? query : null,
    reasoning: '评测注入决策（skip-llm 模式自动合成）',
  };
  return base;
}

/**
 * 从 mock 图谱数据推导某企业的期望子图（与 getRelations 同算法）
 * 返回期望节点 id 集合与边 [sourceId, targetId] 集合
 */
export function expectedGraphFor(enterpriseId: string): {
  nodes: string[];
  edges: [string, string][];
} {
  const connectedNodeIds = new Set<string>([enterpriseId]);
  for (const edge of mockRelations.edges) {
    if (edge.source === enterpriseId || edge.target === enterpriseId) {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    }
  }
  const edges: [string, string][] = mockRelations.edges
    .filter((e) => connectedNodeIds.has(e.source) && connectedNodeIds.has(e.target))
    .map((e) => [e.source, e.target]);
  return { nodes: Array.from(connectedNodeIds), edges };
}

/** 为单家企业生成 3 个单 Agent 用例（company / graph / business） */
function generateCasesForCompany(enterpriseId: string, name: string): EvalCase[] {
  const expectedGraph = expectedGraphFor(enterpriseId);
  const risks = mockRisks.filter((r) => r.enterpriseId === enterpriseId);
  /** 附上自动合成的注入决策（skip-llm 必需） */
  const withDecision = (partial: Omit<EvalCase, 'injectedDecision'>): EvalCase => ({
    ...partial,
    injectedDecision: synthesizeDecision(partial.expectedAgents, partial.query),
  });
  return [
    withDecision({
      id: `mock-${enterpriseId}-company`,
      name: `基本信息-${name}`,
      query: `查一下${name}的基本信息`,
      expectedAgents: { needsCompanyInfo: true, needsGraph: false, needsBusiness: false },
      expectedGraphNodes: [enterpriseId],
    }),
    withDecision({
      id: `mock-${enterpriseId}-graph`,
      name: `关联图谱-${name}`,
      query: `${name}的股权结构和关联企业有哪些`,
      expectedAgents: { needsCompanyInfo: false, needsGraph: true, needsBusiness: false },
      expectedGraphNodes: expectedGraph.nodes,
      expectedGraphEdges: expectedGraph.edges,
    }),
    withDecision({
      id: `mock-${enterpriseId}-business`,
      name: `风险查询-${name}`,
      query: `${name}有什么风险`,
      expectedAgents: { needsCompanyInfo: false, needsGraph: false, needsBusiness: true },
      expectedRisks: risks.map((r) => r.id),
    }),
  ];
}

/** 手工边界用例：注入决策缺失时自动合成 */
function normalizeManualCases(cases: EvalCase[]): EvalCase[] {
  return cases.map((c) =>
    c.injectedDecision
      ? c
      : { ...c, injectedDecision: synthesizeDecision(c.expectedAgents, c.query) },
  );
}

/**
 * 加载完整评测数据集：mock 自动生成（5 家企业 × 3 类用例）+ 手工边界用例
 */
export function loadDataset(): EvalDataset {
  const generatedCases = mockCompanies.flatMap((c) =>
    generateCasesForCompany(c.id, c.name),
  );
  const manualCases = normalizeManualCases(
    (goldenSetJson as { cases: EvalCase[] }).cases,
  );
  return { cases: [...generatedCases, ...manualCases] };
}
