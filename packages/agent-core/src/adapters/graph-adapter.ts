// 客户图谱 Agent HTTP Adapter
// 调用 apps/agent-graph 的 /api/query 接口，返回关联关系图谱数据
import type { SupervisorState } from '../state';

const AGENT_URL = process.env.AGENT_GRAPH_URL ?? 'http://localhost:3002';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : JSON.stringify(error);
}

export async function graphAdapter(
  state: SupervisorState,
): Promise<Partial<SupervisorState>> {
  try {
    const query = state.graphQuery ?? state.supervisorTask;
    if (!query) return { graphOutput: '图谱查询语句缺失。' };

    const res = await fetch(`${AGENT_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      return { graphOutput: `图谱 Agent 调用失败: HTTP ${res.status}` };
    }

    const data = (await res.json()) as { success: boolean; data?: unknown; error?: string };
    if (!data.success) {
      return { graphOutput: `图谱查询失败: ${data.error ?? '未知错误'}` };
    }

    return {
      graphOutput: JSON.stringify(data.data ?? {}, null, 2),
    };
  } catch (error) {
    return {
      graphOutput: `图谱 Agent 不可用或调用失败: ${errorMessage(error)}`,
    };
  }
}
