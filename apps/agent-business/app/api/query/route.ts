// 工商资料 Agent：POST /api/query
// 返回风险、企业需求、网络舆情与财务情况，供 graph-builder 汇总整体报告
import { NextRequest, NextResponse } from 'next/server';
import {
  createVectorStore,
  getDataSource,
  matchEnterpriseByQuery,
  qichachaClient,
} from '@ai/shared';
import type {
  AgentQueryRequest,
  AgentQueryResponse,
  BusinessNeed,
  BusinessQueryResult,
  FinancialSnapshot,
  PublicOpinionItem,
  RiskItem,
  VectorDoc,
} from '@ai/shared';

/** 从查询文本解析企业：enterpriseId 指定 > 精确名称 > 前向搜索首位 > 企业全名包含于查询文本 */
async function resolveEnterpriseId(query: string, enterpriseId?: string): Promise<string | undefined> {
  if (enterpriseId) return enterpriseId;
  const matched = await qichachaClient.searchEnterprise(query);
  if (matched.length > 0) {
    return (matched.find((c) => c.name === query) ?? matched[0]).id;
  }
  // real 模式走企查查模糊搜索（含品牌/简称），无全量列表可回退
  if (getDataSource('business') === 'real') {
    return undefined;
  }
  const all = await qichachaClient.searchEnterprise('');
  return matchEnterpriseByQuery(query, all)?.id;
}

/**
 * 向量库语义检索工商资料文档
 * Chroma 服务未启动或检索失败时降级为空数组，不阻塞主流程
 */
async function searchBusinessDocs(query: string): Promise<VectorDoc[]> {
  try {
    const store = createVectorStore();
    return await store.search(query, { collection: 'business-docs', topK: 5 });
  } catch {
    // 降级：向量库不可用时仅返回企查查结构化风险
    return [];
  }
}

/** 将向量库中携带完整风险元数据的文档并入风险列表（按 id 去重） */
function docsToRisks(docs: VectorDoc[], existing: RiskItem[]): RiskItem[] {
  const knownIds = new Set(existing.map((r) => r.id));
  const result: RiskItem[] = [];
  for (const doc of docs) {
    const meta = doc.metadata;
    if (typeof meta.enterpriseId !== 'string' || typeof meta.type !== 'string') continue;
    const id = typeof meta.id === 'string' ? meta.id : doc.id;
    if (knownIds.has(id)) continue;
    knownIds.add(id);
    result.push({
      id,
      enterpriseId: meta.enterpriseId,
      type: meta.type,
      level: meta.level === 'red' || meta.level === 'yellow' ? meta.level : 'green',
      date: typeof meta.date === 'string' ? meta.date : '',
      detail: doc.content,
      source: typeof meta.source === 'string' ? meta.source : '向量库',
    });
  }
  return result;
}

/** 单类数据加载失败时降级为空数组，不阻塞整体报告 */
async function safeLoad<T>(loader: () => Promise<T[]>, fallback: T[]): Promise<T[]> {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<AgentQueryRequest>;
    const query = body.query?.trim();
    if (!query) {
      return NextResponse.json<AgentQueryResponse>({
        success: false,
        error: 'query 不能为空',
      });
    }

    // 1. 解析目标企业
    const targetId = await resolveEnterpriseId(query, body.enterpriseId);
    if (!targetId) {
      return NextResponse.json<AgentQueryResponse>({
        success: false,
        error: `未找到匹配企业: ${query}`,
      });
    }

    // 2. 并行加载风险、需求、舆情、财务；单类数据失败不阻塞整体
    const [risks, needs, opinions, financials, docs] = await Promise.all([
      safeLoad(() => qichachaClient.getRiskInfo(targetId), [] as RiskItem[]),
      safeLoad(() => qichachaClient.getBusinessNeeds(targetId), [] as BusinessNeed[]),
      safeLoad(() => qichachaClient.getPublicOpinions(targetId), [] as PublicOpinionItem[]),
      safeLoad(() => qichachaClient.getFinancials(targetId), [] as FinancialSnapshot[]),
      searchBusinessDocs(query),
    ]);

    // 3. 向量库检索工商资料，补充非结构化风险描述
    const mergedRisks = [...risks, ...docsToRisks(docs, risks)];

    const result: BusinessQueryResult = {
      risks: mergedRisks,
      needs,
      opinions,
      financials,
    };

    return NextResponse.json<AgentQueryResponse<BusinessQueryResult>>({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json<AgentQueryResponse>({
      success: false,
      error: `工商资料查询失败: ${message}`,
    });
  }
}
