// 客户图谱 Agent：POST /api/query
// Mock 模式走 @ai/shared 的 getRelations，real 模式走 neo4jStore.getRelations
// 返回 GraphData（{ nodes, edges }），供 Supervisor 的 graph-builder 直接解析合并
import { NextRequest, NextResponse } from 'next/server';
import { getRelations, neo4jStore, qichachaClient } from '@ai/shared';
import type { AgentQueryRequest, AgentQueryResponse, GraphData } from '@ai/shared';

/**
 * 从查询文本解析目标企业 ID
 * 优先级：enterpriseId 指定 > 企业全名包含于查询文本 > 未匹配（返回全量图谱）
 */
async function resolveEnterpriseId(query: string, enterpriseId?: string): Promise<string | undefined> {
  if (enterpriseId) return enterpriseId;
  const all = await qichachaClient.searchEnterprise('');
  const matched =
    all.find((c) => query.includes(c.name)) ??
    all.find((c) => c.name.includes(query) || c.creditCode.includes(query));
  return matched?.id;
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

    const targetId = await resolveEnterpriseId(query, body.enterpriseId);

    let graphData: GraphData;
    if (process.env.DATA_SOURCE === 'real') {
      // real 模式：Neo4j 图数据库查询
      graphData = await neo4jStore.getRelations(targetId);
    } else {
      // mock 模式：内存 Mock 数据
      graphData = getRelations(targetId);
    }

    return NextResponse.json<AgentQueryResponse<GraphData>>({
      success: true,
      data: graphData,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json<AgentQueryResponse>({
      success: false,
      error: `关联关系查询失败: ${message}`,
    });
  }
}
