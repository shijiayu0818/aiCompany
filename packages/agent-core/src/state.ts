import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import type { EnterpriseReport, GraphData } from '@ai/shared';

export const SupervisorStateAnnotation = Annotation.Root({
  // 多轮对话消息历史
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  // 用户原始查询
  supervisorTask: Annotation<string>({
    reducer: (curr, next) => next ?? curr,
    default: () => '',
  }),
  // 会话 ID（多轮对话用 MemorySaver）
  threadId: Annotation<string | undefined>({
    reducer: (curr, next) => next ?? curr,
    default: () => undefined,
  }),

  // ===== Supervisor 决策字段 =====
  needsCompanyInfo: Annotation<boolean>({
    reducer: (_curr, next) => next,
    default: () => false,
  }),
  companyQuery: Annotation<string | undefined>({
    reducer: (curr, next) => next ?? curr,
    default: () => undefined,
  }),
  needsGraph: Annotation<boolean>({
    reducer: (_curr, next) => next,
    default: () => false,
  }),
  graphQuery: Annotation<string | undefined>({
    reducer: (curr, next) => next ?? curr,
    default: () => undefined,
  }),
  needsBusiness: Annotation<boolean>({
    reducer: (_curr, next) => next,
    default: () => false,
  }),
  businessQuery: Annotation<string | undefined>({
    reducer: (curr, next) => next ?? curr,
    default: () => undefined,
  }),
  reasoning: Annotation<string>({
    reducer: (_curr, next) => next,
    default: () => '',
  }),
  directResponse: Annotation<string | undefined>({
    reducer: (curr, next) => next ?? curr,
    default: () => undefined,
  }),

  // ===== Worker 输出字段 =====
  companyOutput: Annotation<string>({
    reducer: (_curr, next) => next,
    default: () => '',
  }),
  graphOutput: Annotation<string>({
    reducer: (_curr, next) => next,
    default: () => '',
  }),
  businessOutput: Annotation<string>({
    reducer: (_curr, next) => next,
    default: () => '',
  }),

  // ===== 最终图谱数据 =====
  currentGraph: Annotation<GraphData | undefined>({
    reducer: (curr, next) => next ?? curr,
    default: () => undefined,
  }),

  // ===== 企业整体查询报告（企业信息 / 关联企业 / 风险 / 需求 / 舆情 / 财务） =====
  currentReport: Annotation<EnterpriseReport | undefined>({
    reducer: (curr, next) => next ?? curr,
    default: () => undefined,
  }),
});

export type SupervisorState = typeof SupervisorStateAnnotation.State;
export type SupervisorUpdate = typeof SupervisorStateAnnotation.Update;
