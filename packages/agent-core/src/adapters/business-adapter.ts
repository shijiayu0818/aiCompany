// 工商资料 Agent HTTP Adapter
// 调用 apps/agent-business 的 /api/query 接口，返回工商变更与风险信息
import type { SupervisorState } from '../state';

const AGENT_URL = process.env.AGENT_BUSINESS_URL ?? 'http://localhost:3003';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : JSON.stringify(error);
}

export async function businessAdapter(
  state: SupervisorState,
): Promise<Partial<SupervisorState>> {
  try {
    const query = state.businessQuery ?? state.supervisorTask;
    if (!query) return { businessOutput: '工商资料查询语句缺失。' };

    const res = await fetch(`${AGENT_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      return { businessOutput: `工商资料 Agent 调用失败: HTTP ${res.status}` };
    }

    const data = (await res.json()) as { success: boolean; data?: unknown; error?: string };
    if (!data.success) {
      return { businessOutput: `工商资料查询失败: ${data.error ?? '未知错误'}` };
    }

    return {
      businessOutput: JSON.stringify(data.data ?? {}, null, 2),
    };
  } catch (error) {
    return {
      businessOutput: `工商资料 Agent 不可用或调用失败: ${errorMessage(error)}`,
    };
  }
}
