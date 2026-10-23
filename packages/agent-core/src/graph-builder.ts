// 图谱组装器（Reporter）
// 汇总三个 Worker 的输出，组装成统一的 GraphData
import type { GraphData, GraphNode, GraphEdge } from '@ai/shared';
import type { SupervisorState } from './state';

/**
 * 尝试将字符串解析为 JSON
 */
function safeParse<T>(str: string): T | null {
  try {
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}

/**
 * 合并两个 GraphData（多轮增量更新用）
 * 节点按 id 去重，边按 id 去重
 */
function mergeGraphData(existing: GraphData | undefined, incoming: GraphData): GraphData {
  if (!existing || existing.nodes.length === 0) return incoming;

  const nodeMap = new Map<string, GraphNode>();
  for (const node of existing.nodes) nodeMap.set(node.id, node);
  for (const node of incoming.nodes) nodeMap.set(node.id, node);

  const edgeMap = new Map<string, GraphEdge>();
  for (const edge of existing.edges) edgeMap.set(edge.id, edge);
  for (const edge of incoming.edges) edgeMap.set(edge.id, edge);

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
  };
}

/**
 * 图谱组装器节点
 * 汇总 companyOutput / graphOutput / businessOutput，输出 currentGraph
 */
export async function graphBuilderNode(
  state: SupervisorState,
): Promise<Partial<SupervisorState>> {
  // 1. 从 graphOutput 解析图谱数据（核心数据源）
  const graphData = safeParse<GraphData>(state.graphOutput);

  if (!graphData || !Array.isArray(graphData.nodes) || graphData.nodes.length === 0) {
    // 没有图谱数据时，尝试从企业信息输出构造单节点
    const companyData = safeParse<Record<string, unknown>>(state.companyOutput);
    if (companyData && companyData.name) {
      const singleNode: GraphData = {
        nodes: [
          {
            id: (companyData.id as string) ?? 'unknown',
            type: 'enterprise',
            name: companyData.name as string,
            detail: state.companyOutput,
          },
        ],
        edges: [],
      };
      return {
        currentGraph: mergeGraphData(state.currentGraph, singleNode),
      };
    }
    return { currentGraph: state.currentGraph };
  }

  // 2. 附加企业信息到企业节点的 detail
  const companyInfo = safeParse<Record<string, unknown>>(state.companyOutput);
  if (companyInfo) {
    for (const node of graphData.nodes) {
      if (node.type === 'enterprise' && companyInfo.name === node.name) {
        node.detail = state.companyOutput;
      }
    }
  }

  // 3. 附加风险信息到对应企业节点（按 enterpriseId 与 refId 精确匹配）
  const businessInfo = safeParse<Record<string, unknown>[]>(state.businessOutput);
  if (Array.isArray(businessInfo)) {
    for (const node of graphData.nodes) {
      if (node.type === 'enterprise') {
        const risks = businessInfo.filter(
          (r) => (r.enterpriseId as string) === node.refId,
        );
        if (risks.length > 0) {
          node.meta = `风险${risks.length}条`;
        }
      }
    }
  }

  // 4. 合并已有图谱（多轮增量更新）
  return {
    currentGraph: mergeGraphData(state.currentGraph, graphData),
  };
}
