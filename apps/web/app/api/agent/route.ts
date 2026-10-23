// LangGraph 编排入口：POST 流式 SSE / GET 会话恢复
import { NextRequest, NextResponse } from 'next/server';
import { HumanMessage } from '@langchain/core/messages';
import { getGraphInstance } from '../../../lib/graph-instance';
import { createSSEResponse } from '../../../lib/sse';
import type { SSEEvent, SupervisorDecision, WorkerResult } from '../../../lib/types';
import type { GraphData } from '@ai/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/agent
 * 请求体：{ query: string, threadId?: string }
 * 响应：SSE text/event-stream
 *
 * 流式推送 LangGraph 各节点状态：
 *   start → supervisor → worker(s) → graph → done
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { query?: string; threadId?: string };
    const query = body.query?.trim();
    if (!query) {
      return NextResponse.json({ error: 'query 不能为空' }, { status: 400 });
    }

    const threadId = body.threadId || crypto.randomUUID();
    const graph = getGraphInstance();

    async function* eventStream(userQuery: string): AsyncGenerator<SSEEvent> {
      yield { type: 'start', threadId };

      // streamMode: 'updates' — 每步只返回状态增量 { [nodeName]: stateUpdate }
      const stream = await graph.stream(
        {
          supervisorTask: userQuery,
          threadId,
          messages: [new HumanMessage(userQuery)],
        },
        {
          configurable: { thread_id: threadId },
          streamMode: 'updates',
        },
      );

      for await (const chunk of stream) {
        // chunk 格式：{ [nodeName]: Partial<SupervisorState> }
        for (const [nodeName, update] of Object.entries(chunk)) {
          const stateUpdate = update as Record<string, unknown>;

          if (nodeName === 'supervisor') {
            const decision: SupervisorDecision = {
              taskDescription: (stateUpdate.supervisorTask as string) ?? '',
              needsCompanyInfo: (stateUpdate.needsCompanyInfo as boolean) ?? false,
              companyQuery: stateUpdate.companyQuery as string | undefined,
              needsGraph: (stateUpdate.needsGraph as boolean) ?? false,
              graphQuery: stateUpdate.graphQuery as string | undefined,
              needsBusiness: (stateUpdate.needsBusiness as boolean) ?? false,
              businessQuery: stateUpdate.businessQuery as string | undefined,
              reasoning: (stateUpdate.reasoning as string) ?? '',
            };
            yield { type: 'supervisor', data: decision };
          } else if (
            nodeName === 'company_node' ||
            nodeName === 'graph_node' ||
            nodeName === 'business_node'
          ) {
            const outputKey =
              nodeName === 'company_node'
                ? 'companyOutput'
                : nodeName === 'graph_node'
                  ? 'graphOutput'
                  : 'businessOutput';
            const output = (stateUpdate[outputKey] as string) ?? '';
            // 简单启发式：输出含错误关键词标记为 error
            const hasError =
              output.includes('失败') ||
              output.includes('不可用') ||
              output.includes('错误');
            const result: WorkerResult = {
              node: nodeName,
              output,
              status: hasError ? 'error' : 'done',
            };
            yield { type: 'worker', data: result };
          } else if (nodeName === 'graph_builder') {
            const currentGraph = stateUpdate.currentGraph as GraphData | undefined;
            if (currentGraph) {
              yield { type: 'graph', data: { currentGraph } };
            }
          }
        }
      }

      yield { type: 'done', threadId };
    }

    return createSSEResponse(eventStream(query));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/agent?threadId=xxx
 * 从 MemorySaver 恢复会话状态（页面刷新后重建展示）
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get('threadId');
  if (!threadId) {
    return NextResponse.json({ error: 'threadId is required' }, { status: 400 });
  }

  const graph = getGraphInstance();
  const snapshot = await graph.getState({ configurable: { thread_id: threadId } });

  if (!snapshot || !snapshot.values) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const state = snapshot.values;
  return NextResponse.json({
    threadId,
    currentGraph: state.currentGraph,
    reasoning: state.reasoning,
    supervisorTask: state.supervisorTask,
  });
}
