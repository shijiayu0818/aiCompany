// 企业信息 Agent HTTP Adapter
// 调用 apps/agent-company 的 /api/query 接口
import type { SupervisorState } from '../state';

const AGENT_URL = process.env.AGENT_COMPANY_URL ?? 'http://localhost:3001';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : JSON.stringify(error);
}

export async function companyAdapter(
  state: SupervisorState,
): Promise<Partial<SupervisorState>> {
  try {
    const query = state.companyQuery ?? state.supervisorTask;
    if (!query) return { companyOutput: '企业信息查询语句缺失。' };

    const res = await fetch(`${AGENT_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      return { companyOutput: `企业信息 Agent 调用失败: HTTP ${res.status}` };
    }

    const data = (await res.json()) as { success: boolean; data?: unknown; error?: string };
    if (!data.success) {
      return { companyOutput: `企业信息查询失败: ${data.error ?? '未知错误'}` };
    }

    return {
      companyOutput: JSON.stringify(data.data ?? {}, null, 2),
    };
  } catch (error) {
    return {
      companyOutput: `企业信息 Agent 不可用或调用失败: ${errorMessage(error)}`,
    };
  }
}
