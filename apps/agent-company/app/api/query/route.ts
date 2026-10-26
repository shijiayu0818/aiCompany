// 企业信息 Agent：POST /api/query
// 调用 @ai/shared 的 qichachaClient.searchEnterprise 检索企业基本信息
// Mock/real 由 DATA_SOURCE 环境变量切换（在 qichachaClient 内部处理）
import { NextRequest, NextResponse } from 'next/server';
import {
  computeRiskFlags,
  getDataSource,
  matchEnterpriseByQuery,
  qichachaClient,
} from '@ai/shared';
import type {
  AgentQueryRequest,
  AgentQueryResponse,
  Enterprise,
  EnterpriseDetail,
} from '@ai/shared';

/**
 * 从查询文本解析最佳匹配企业
 * 优先级：enterpriseId 指定 > 精确名称 > 前向搜索首位 > 企业全名包含于查询文本
 * 最后一档用于应对 Supervisor 透传原始自然语言的情况（如“查星辰智能科技集团的工商信息”）
 */
async function resolveEnterprise(query: string, enterpriseId?: string): Promise<Enterprise | null> {
  if (enterpriseId) {
    const detail = await qichachaClient.getEnterpriseDetail(enterpriseId);
    if (detail) return detail;
  }
  const matched = await qichachaClient.searchEnterprise(query);
  if (matched.length > 0) {
    const brief = matched.find((c) => c.name === query) ?? matched[0];
    // 搜索简表不含注册资本/行业/地区等，用详情接口补全
    return (await qichachaClient.getEnterpriseDetail(brief.id)) ?? brief;
  }
  // real 模式走企查查模糊搜索（含品牌/简称），无全量列表可回退
  if (getDataSource('company') === 'real') {
    return null;
  }
  const all = await qichachaClient.searchEnterprise('');
  return matchEnterpriseByQuery(query, all) ?? null;
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

    const enterprise = await resolveEnterprise(query, body.enterpriseId);
    if (!enterprise) {
      return NextResponse.json<AgentQueryResponse>({
        success: false,
        error: `未找到匹配企业: ${query}`,
      });
    }

    // 补充工商变更记录并计算变更预警（高频变更 / 频繁更换法人股东）
    const changeHistory = await qichachaClient.getChangeHistory(enterprise.id);
    const detail: EnterpriseDetail = {
      ...enterprise,
      changeHistory,
      riskFlags: computeRiskFlags(changeHistory),
    };

    return NextResponse.json<AgentQueryResponse<EnterpriseDetail>>({
      success: true,
      data: detail,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json<AgentQueryResponse>({
      success: false,
      error: `企业信息查询失败: ${message}`,
    });
  }
}
