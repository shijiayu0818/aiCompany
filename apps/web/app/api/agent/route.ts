// LangGraph 编排入口：POST 流式 SSE / GET 会话恢复
import { NextRequest, NextResponse } from 'next/server';
import { HumanMessage } from '@langchain/core/messages';
import { assembleReport } from '@ai/agent-core';
import { getGraphInstance } from '../../../lib/graph-instance';
import { createSSEResponse } from '../../../lib/sse';
import type { SSEEvent, SupervisorDecision, WorkerResult } from '../../../lib/types';
import type { EnterpriseReport, GraphData } from '@ai/shared';

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

      // 增量组装上下文：每有一个 Worker 返回就补全一次，立即下发已有结果
      let needsGraph = false;
      let companyOutput = '';
      let graphOutput = '';
      let businessOutput = '';
      // 会话既有图谱 / 报告：多轮查询时参与增量合并
      let currentGraph: GraphData | undefined;
      let currentReport: EnterpriseReport | undefined;
      try {
        const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
        const values = snapshot?.values as
          | { currentGraph?: GraphData; currentReport?: EnterpriseReport }
          | undefined;
        currentGraph = values?.currentGraph;
        currentReport = values?.currentReport;
      } catch {
        // 新会话尚无检查点，无需合并历史数据
      }

      /** 用当前已返回的 Worker 输出做一次增量组装 */
      const runPartialAssemble = (): SSEEvent[] => {
        const partial = assembleReport({
          companyOutput,
          graphOutput,
          businessOutput,
          needsGraph,
          currentGraph,
          currentReport,
        });
        currentGraph = partial.currentGraph;
        currentReport = partial.currentReport;

        const events: SSEEvent[] = [];
        if (partial.currentGraph) {
          events.push({ type: 'graph', data: { currentGraph: partial.currentGraph } });
        }
        if (partial.currentReport) {
          events.push({ type: 'report', data: partial.currentReport });
        }
        return events;
      };

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
            needsGraph = (stateUpdate.needsGraph as boolean) ?? false;
            const decision: SupervisorDecision = {
              taskDescription: (stateUpdate.supervisorTask as string) ?? '',
              needsCompanyInfo: (stateUpdate.needsCompanyInfo as boolean) ?? false,
              companyQuery: stateUpdate.companyQuery as string | undefined,
              needsGraph,
              graphQuery: stateUpdate.graphQuery as string | undefined,
              needsBusiness: (stateUpdate.needsBusiness as boolean) ?? false,
              businessQuery: stateUpdate.businessQuery as string | undefined,
              reasoning: (stateUpdate.reasoning as string) ?? '',
              directResponse: stateUpdate.directResponse as string | undefined,
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
            if (nodeName === 'company_node') companyOutput = output;
            else if (nodeName === 'graph_node') graphOutput = output;
            else businessOutput = output;

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

            // 该 Worker 结果已可展示：立即增量组装并下发，前端无需等全部完成
            for (const event of runPartialAssemble()) yield event;
          } else if (nodeName === 'graph_builder') {
            const finalGraph = stateUpdate.currentGraph as GraphData | undefined;
            if (finalGraph) {
              currentGraph = finalGraph;
              yield { type: 'graph', data: { currentGraph: finalGraph } };
            }
            const report = stateUpdate.currentReport as EnterpriseReport | undefined;
            if (report) {
              currentReport = report;
              yield { type: 'report', data: report };
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
    currentReport: state.currentReport,
    reasoning: state.reasoning,
    supervisorTask: state.supervisorTask,
  });
}
