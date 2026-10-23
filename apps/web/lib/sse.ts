// SSE 流式响应工具（仅服务端）
// AGENTS.md: LLM 流式输出用 SSE（text/event-stream），禁止缓冲完整响应后一次性返回

import type { SSEEvent } from './types';

/**
 * 将异步事件流转换为 SSE Response
 * 每个 SSEEvent 序列化为 `data: {json}\n\n` 格式
 */
export function createSSEResponse(events: AsyncIterable<SSEEvent>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
      } catch (error) {
        const errorEvent: SSEEvent = {
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
