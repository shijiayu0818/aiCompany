// 图谱与报告组装器（Reporter）
// 汇总三个 Worker 的输出，组装 GraphData 与企业整体查询报告
import { computeRiskFlags } from '@ai/shared';
import type {
  BusinessQueryResult,
  Enterprise,
  EnterpriseDetail,
  EnterpriseReport,
  GraphData,
  GraphEdge,
  GraphNode,
  PublicOpinionItem,
  RelatedEnterprise,
  RiskAssessment,
  RiskFlag,
  RiskItem,
} from '@ai/shared';
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

/** 解析企业信息 Agent 输出（缺失字段时视为无效） */
function parseCompanyOutput(output: string): EnterpriseDetail | null {
  const parsed = safeParse<EnterpriseDetail>(output);
  if (!parsed || typeof parsed.name !== 'string' || !parsed.name) return null;
  return parsed;
}

/** 解析工商资料 Agent 输出（风险 / 需求 / 舆情 / 财务） */
function parseBusinessOutput(output: string): BusinessQueryResult | null {
  const parsed = safeParse<Partial<BusinessQueryResult>>(output);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return {
    risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    needs: Array.isArray(parsed.needs) ? parsed.needs : [],
    opinions: Array.isArray(parsed.opinions) ? parsed.opinions : [],
    financials: Array.isArray(parsed.financials) ? parsed.financials : [],
  };
}

/** 节点 detail 为 JSON 时（如企业信息）不作为地区展示 */
function readRegion(detail?: string): string | undefined {
  if (!detail) return undefined;
  const trimmed = detail.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[') ? undefined : detail;
}

/** 从图谱提取关联企业（直接关联标注关系，其余标注间接关联） */
function buildRelatedEnterprises(graph: GraphData, targetId: string): RelatedEnterprise[] {
  const directEdges = new Map<string, GraphEdge>();
  for (const edge of graph.edges) {
    if (edge.source === targetId) directEdges.set(edge.target, edge);
    else if (edge.target === targetId) directEdges.set(edge.source, edge);
  }

  return graph.nodes
    .filter((node) => node.type === 'enterprise' && node.id !== targetId)
    .map((node) => {
      const edge = directEdges.get(node.id);
      return {
        id: node.id,
        name: node.name,
        relation: edge?.type ?? '间接关联',
        label: edge?.label,
        industry: node.meta,
        region: readRegion(node.detail),
      };
    });
}

/** 综合风险评级：风险记录权重 + 负面舆情权重，分数越高风险越大 */
function assessRisk(
  risks: RiskItem[],
  opinions: PublicOpinionItem[],
): RiskAssessment {
  const redCount = risks.filter((risk) => risk.level === 'red').length;
  const yellowCount = risks.filter((risk) => risk.level === 'yellow').length;
  const negativeCount = opinions.filter((item) => item.sentiment === 'negative').length;

  const score = Math.min(
    redCount * 20 + yellowCount * 8 + Math.min(negativeCount * 4, 20),
    100,
  );
  const grade = score >= 75 ? 'D' : score >= 50 ? 'C' : score >= 25 ? 'B' : 'A';
  const level = grade === 'A' ? 'green' : grade === 'B' ? 'yellow' : 'red';

  const riskPart =
    risks.length === 0
      ? '未发现公开风险记录'
      : `共 ${risks.length} 条风险记录（红色 ${redCount} 条、黄色 ${yellowCount} 条）`;
  const opinionPart =
    negativeCount > 0 ? `，另有 ${negativeCount} 条负面舆情` : '';

  return {
    level,
    grade,
    score,
    redCount,
    yellowCount,
    summary: `${riskPart}${opinionPart}`,
  };
}

/** 增量组装输入：输出为空表示该 Worker 尚未返回 */
export interface AssembleReportInput {
  companyOutput?: string;
  graphOutput?: string;
  businessOutput?: string;
  /** 本次查询是否需要图谱（needsGraph=false 时清空图谱） */
  needsGraph: boolean;
  /** 上一轮图谱 / 报告（多轮增量合并用） */
  currentGraph?: GraphData;
  currentReport?: EnterpriseReport;
}

export interface AssembleReportResult {
  currentGraph?: GraphData;
  currentReport?: EnterpriseReport;
}

/**
 * 组装图谱与报告（纯函数，可被增量调用）
 * 仅使用已传入的输出组装，未传入的 Worker 数据视为尚未返回
 */
export function assembleReport(input: AssembleReportInput): AssembleReportResult {
  const graphData = safeParse<GraphData>(input.graphOutput ?? '');
  const company = parseCompanyOutput(input.companyOutput ?? '');
  const business = parseBusinessOutput(input.businessOutput ?? '');

  let currentGraph = input.currentGraph;

  // 本次查询不涉及图谱（needsGraph=false）时清空图谱，前端不再展示图谱区
  if (!input.needsGraph) {
    currentGraph = undefined;
  }
  // 1. 组装图谱
  else if (graphData && Array.isArray(graphData.nodes) && graphData.nodes.length > 0) {
    // 附加企业信息到企业节点的 detail
    if (company) {
      for (const node of graphData.nodes) {
        if (node.type === 'enterprise' && company.name === node.name) {
          node.detail = input.companyOutput ?? '';
        }
      }
    }

    // 附加风险信息到对应企业节点（按 enterpriseId 与 refId 精确匹配）
    if (business) {
      for (const node of graphData.nodes) {
        if (node.type !== 'enterprise') continue;
        const risks = business.risks.filter(
          (risk) => risk.enterpriseId === node.refId,
        );
        if (risks.length > 0) {
          node.meta = `风险${risks.length}条`;
        }
      }
    }

    currentGraph = mergeGraphData(input.currentGraph, graphData);
  } else if (company) {
    // 没有图谱数据时，用企业信息构造单节点
    const singleNode: GraphData = {
      nodes: [
        {
          id: company.id ?? 'unknown',
          type: 'enterprise',
          name: company.name,
          detail: input.companyOutput ?? '',
        },
      ],
      edges: [],
    };
    currentGraph = mergeGraphData(input.currentGraph, singleNode);
  }

  // 2. 汇总整体查询报告（缺少企业主体时无法生成报告）
  const enterprise: Enterprise | undefined =
    company ?? input.currentReport?.enterprise;
  if (!enterprise) {
    return { currentGraph };
  }

  const existing = input.currentReport;
  const changes = company?.changeHistory ?? existing?.changes ?? [];
  const providedFlags = company?.riskFlags ?? existing?.flags ?? [];
  const risks = business?.risks ?? existing?.risks ?? [];
  const needs = business?.needs ?? existing?.needs ?? [];
  const opinions = business?.opinions ?? existing?.opinions ?? [];
  const financials = business?.financials ?? existing?.financials ?? [];
  const flags: RiskFlag[] =
    providedFlags.length > 0 ? providedFlags : computeRiskFlags(changes);

  const report: EnterpriseReport = {
    enterprise,
    changes,
    flags,
    relatedEnterprises: buildRelatedEnterprises(
      currentGraph ?? { nodes: [], edges: [] },
      enterprise.id,
    ),
    riskAssessment: assessRisk(risks, opinions),
    risks,
    needs,
    opinions,
    financials,
    generatedAt: new Date().toISOString(),
  };

  return { currentGraph, currentReport: report };
}

/**
 * 图谱组装器节点
 * 汇总 companyOutput / graphOutput / businessOutput，输出 currentGraph 与 currentReport
 */
export async function graphBuilderNode(
  state: SupervisorState,
): Promise<Partial<SupervisorState>> {
  return assembleReport({
    companyOutput: state.companyOutput,
    graphOutput: state.graphOutput,
    businessOutput: state.businessOutput,
    needsGraph: state.needsGraph,
    currentGraph: state.currentGraph,
    currentReport: state.currentReport,
  });
}
