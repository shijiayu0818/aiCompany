// 前端与服务端共享的类型定义（纯类型，无运行时代码）

import type { EnterpriseReport, GraphData } from '@ai/shared';

// ===== SSE 事件类型 =====
export type SSEEvent =
  | { type: 'start'; threadId: string }
  | { type: 'supervisor'; data: SupervisorDecision }
  | { type: 'worker'; data: WorkerResult }
  | { type: 'graph'; data: { currentGraph: GraphData } }
  | { type: 'report'; data: EnterpriseReport }
  | { type: 'done'; threadId: string }
  | { type: 'error'; message: string };

// Supervisor 决策（映射 SupervisorState 决策字段）
export interface SupervisorDecision {
  taskDescription: string;
  needsCompanyInfo: boolean;
  companyQuery?: string;
  needsGraph: boolean;
  graphQuery?: string;
  needsBusiness: boolean;
  businessQuery?: string;
  reasoning: string;
  /** 直接回复文本：跳过所有 Agent 调用时设置（问候、功能咨询、无对应数据等） */
  directResponse?: string;
}

// Worker 执行结果
export interface WorkerResult {
  node: 'company_node' | 'graph_node' | 'business_node';
  output: string;
  status: 'done' | 'error';
}

// ===== 前端 UI 类型 =====

// 会话元数据（session 列表 UI 用，仅 ID + 标题，不含会话状态）
export interface SessionMeta {
  threadId: string;
  title: string;
  createdAt: number;
  lastQuery?: string;
}

// AgentProcess 单步状态
export interface ProcessStep {
  node: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  output?: string;
}

// AgentProcess 完整状态
export interface AgentProcessState {
  supervisor?: SupervisorDecision;
  steps: ProcessStep[];
  graphReady: boolean;
}
