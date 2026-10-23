// 企业评分器：风险等级加权（red=3/yellow=1，封顶 70）+ 图谱关联度（每边 2 分，封顶 30）
// 输出 0-100 风险分 + A/B/C/D 等级（分数越高风险越大）
import type { GraphData, RiskItem } from '@ai/shared';
import type { EnterpriseGrade, EnterpriseScore } from '../types';

/** 等级划分：A 低风险 / B 关注 / C 较高风险 / D 高风险 */
function toGrade(score: number): EnterpriseGrade {
  if (score >= 75) return 'D';
  if (score >= 50) return 'C';
  if (score >= 25) return 'B';
  return 'A';
}

/**
 * 对图谱中的企业节点评分
 * - 风险匹配按 enterpriseId === 节点 refId 精确匹配（禁止企业名宽匹配）
 * - riskScore = red*3 + yellow*1，封顶 70
 * - relationScore = 关联边数*2，封顶 30
 * - score = riskScore + relationScore（0-100）
 */
export function scoreEnterprises(graph: GraphData, risks: RiskItem[]): EnterpriseScore[] {
  const scores: EnterpriseScore[] = [];

  for (const node of graph.nodes) {
    if (node.type !== 'enterprise') continue;
    const enterpriseId = node.refId ?? node.id;

    const enterpriseRisks = risks.filter((r) => r.enterpriseId === enterpriseId);
    const red = enterpriseRisks.filter((r) => r.level === 'red').length;
    const yellow = enterpriseRisks.filter((r) => r.level === 'yellow').length;
    const riskScore = Math.min(red * 3 + yellow * 1, 70);

    const relationDegree = graph.edges.filter(
      (e) => e.source === enterpriseId || e.target === enterpriseId,
    ).length;
    const relationScore = Math.min(relationDegree * 2, 30);

    const score = riskScore + relationScore;
    scores.push({
      enterpriseId,
      name: node.name,
      score,
      grade: toGrade(score),
      riskScore,
      relationScore,
      riskCount: { red, yellow },
      relationDegree,
    });
  }

  return scores;
}

/**
 * 合并多个 GraphData（多 case 图谱汇总用）
 * 节点按 id 去重，边按 source->target->type 去重（跨 case 边 id 可能重复）
 */
export function mergeGraphs(graphs: GraphData[]): GraphData {
  const nodeMap = new Map<string, GraphData['nodes'][number]>();
  const edgeMap = new Map<string, GraphData['edges'][number]>();

  for (const graph of graphs) {
    for (const node of graph.nodes) nodeMap.set(node.id, node);
    for (const edge of graph.edges) {
      edgeMap.set(`${edge.source}->${edge.target}:${edge.type}`, edge);
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
  };
}
