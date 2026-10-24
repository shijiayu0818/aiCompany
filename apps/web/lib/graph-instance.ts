// 模块级 LangGraph 图实例单例（仅服务端）
// 使用 SqliteSaver 把会话检查点持久化到本地 SQLite，进程重启后仍可恢复历史会话

import fs from 'node:fs';
import path from 'node:path';
import { createGraph } from '@ai/agent-core';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';

let graphInstance: ReturnType<typeof createGraph> | null = null;

function createCheckpointer() {
  const dir = path.join(process.cwd(), '.data');
  fs.mkdirSync(dir, { recursive: true });
  return SqliteSaver.fromConnString(path.join(dir, 'checkpoints.sqlite'));
}

/**
 * 获取 LangGraph 图实例（单例）
 * 首次调用时创建带 SQLite 检查点的图，后续复用同一实例
 */
export function getGraphInstance() {
  if (!graphInstance) {
    graphInstance = createGraph({ checkpointer: createCheckpointer() });
  }
  return graphInstance;
}
