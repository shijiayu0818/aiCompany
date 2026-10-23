// 模块级 LangGraph 图实例单例（仅服务端）
// MemorySaver 存于图实例内部，同一进程内跨请求保持会话状态

import { createGraph } from '@ai/agent-core';

let graphInstance: ReturnType<typeof createGraph> | null = null;

/**
 * 获取 LangGraph 图实例（单例）
 * 首次调用时创建含 MemorySaver 的图，后续复用同一实例
 */
export function getGraphInstance() {
  if (!graphInstance) {
    graphInstance = createGraph();
  }
  return graphInstance;
}
