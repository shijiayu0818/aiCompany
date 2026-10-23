// 工商资料 Agent：POST /api/query
// 调用 qichachaClient.getRiskInfo 获取结构化风险 + 向量库语义检索工商资料
// 返回 RiskItem 数组（graph-builder 按数组统计各企业风险数）
import { NextRequest, NextResponse } from 'next/server';
import { createVectorStore, qichachaClient } from '@ai/shared';
import type { AgentQueryRequest, AgentQueryResponse, RiskItem, VectorDoc } from '@ai/shared';

/** 从查询文本解析企业：enterpriseId 指定 > 精确名称 > 前向搜索首位 > 企业全名包含于查询文本 */
async function resolveEnterpriseId(query: string, enterpriseId?: string): Promise<string | undefined> {
  if (enterpriseId) return enterpriseId;
  const matched = await qichachaClient.searchEnterprise(query);
  if (matched.length > 0) {
    return (matched.find((c) => c.name === query) ?? matched[0]).id;
  }
  const all = await qichachaClient.searchEnterprise('');
  return all.find((c) => query.includes(c.name))?.id;
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

    // 1. 解析目标企业并获取结构化风险
    const targetId = await resolveEnterpriseId(query, body.enterpriseId);
    const risks: RiskItem[] = targetId ? await qichachaClient.getRiskInfo(targetId) : [];

    // 2. 向量库检索工商资料，补充非结构化风险描述
    const docs = await searchBusinessDocs(query);
    const merged = [...risks, ...docsToRisks(docs, risks)];

    return NextResponse.json<AgentQueryResponse<RiskItem[]>>({
      success: true,
      data: merged,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json<AgentQueryResponse>({
      success: false,
      error: `工商资料查询失败: ${message}`,
    });
  }
}
