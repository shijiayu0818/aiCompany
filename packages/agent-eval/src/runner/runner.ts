// 评测执行器：双模式运行 Golden Set
// - llm 模式：真调 LLM（完整 LangGraph 编排，评 Supervisor 决策准确率）
// - skip-llm 模式：按用例注入决策（零密钥、确定性，可进 CI）
// 前置条件：三个 Agent 服务在线（adapters 走 HTTP，服务内部 mock 数据零密钥）
import { HumanMessage, AIMessage, type BaseMessage } from '@langchain/core/messages';
import {
  createGraph,
  companyAdapter,
  graphAdapter,
  businessAdapter,
  graphBuilderNode,
  type SupervisorState,
} from '@ai/agent-core';
import type { GraphData, RiskItem } from '@ai/shared';
import type {
  CaseResult,
  EvalCase,
  EvalMode,
  TaskDistributionLike,
} from '../types';
import { computeDecisionCorrect, computeHitRate } from '../metrics/metrics';

const EMPTY_GRAPH: GraphData = { nodes: [], edges: [] };

/** 将多轮历史转换为 LangChain 消息 */
function toMessages(history: EvalCase['history']): BaseMessage[] {
  if (!history) return [];
  return history.map((m) =>
    m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
  );
}

/** 从决策 + 查询构造完整 SupervisorState（skip-llm 手动执行用） */
function buildStateForInjected(
  evalCase: EvalCase,
  decision: TaskDistributionLike,
): SupervisorState {
  return {
    messages: toMessages(evalCase.history),
    supervisorTask: evalCase.query || decision.taskDescription,
    threadId: `eval-${evalCase.id}`,
    needsCompanyInfo: decision.needsCompanyInfo,
    companyQuery: decision.companyQuery ?? undefined,
    needsGraph: decision.needsGraph,
    graphQuery: decision.graphQuery ?? undefined,
    needsBusiness: decision.needsBusiness,
    businessQuery: decision.businessQuery ?? undefined,
    reasoning: decision.reasoning ?? '',
    companyOutput: '',
    graphOutput: '',
    businessOutput: '',
    currentGraph: undefined,
    currentReport: undefined,
  };
}

/** 决策字段归一为 TaskDistributionLike */
function normalizeDecision(state: {
  supervisorTask: string;
  needsCompanyInfo: boolean;
  companyQuery?: string;
  needsGraph: boolean;
  graphQuery?: string;
  needsBusiness: boolean;
  businessQuery?: string;
  reasoning: string;
}): TaskDistributionLike {
  return {
    taskDescription: state.supervisorTask,
    needsCompanyInfo: state.needsCompanyInfo,
    companyQuery: state.companyQuery ?? null,
    needsGraph: state.needsGraph,
    graphQuery: state.graphQuery ?? null,
    needsBusiness: state.needsBusiness,
    businessQuery: state.businessQuery ?? null,
    reasoning: state.reasoning ?? '',
  };
}

/** 解析 businessOutput 中的风险 id 列表（兼容 { risks } 对象结构） */
export function extractRiskIds(businessOutput: string): string[] {
  try {
    const parsed = JSON.parse(businessOutput) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { risks?: unknown })?.risks)
        ? ((parsed as { risks: unknown[] }).risks)
        : [];
    return list
      .map((r) => (typeof (r as RiskItem)?.id === 'string' ? (r as RiskItem).id : ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** llm 模式：完整 LangGraph 编排执行（真调 LLM） */
async function runWithLLM(evalCase: EvalCase): Promise<{
  decision: TaskDistributionLike;
  graph: GraphData;
  riskIds: string[];
}> {
  const graph = createGraph();
  const finalState = (await graph.invoke(
    { supervisorTask: evalCase.query, messages: toMessages(evalCase.history) },
    { configurable: { thread_id: `eval-${evalCase.id}` } },
  )) as SupervisorState;

  return {
    decision: normalizeDecision(finalState),
    graph: finalState.currentGraph ?? EMPTY_GRAPH,
    riskIds: extractRiskIds(finalState.businessOutput),
  };
}

/** skip-llm 模式：注入决策 → 手动执行 workers → graph-builder */
async function runWithInjectedDecision(evalCase: EvalCase): Promise<{
  decision: TaskDistributionLike;
  graph: GraphData;
  riskIds: string[];
}> {
  const injected = evalCase.injectedDecision;
  if (!injected) {
    throw new Error(`用例 ${evalCase.id} 缺少 injectedDecision（skip-llm 模式必需）`);
  }
  const state = buildStateForInjected(evalCase, injected);

  // 按注入决策依次调用激活的 Worker（每个 Adapter 内部已有 try/catch 降级）
  const updates: Partial<SupervisorState>[] = [];
  if (state.needsCompanyInfo) updates.push(await companyAdapter(state));
  if (state.needsGraph) updates.push(await graphAdapter(state));
  if (state.needsBusiness) updates.push(await businessAdapter(state));

  const mergedState: SupervisorState = { ...state, ...Object.assign({}, ...updates) };
  const builderUpdate = await graphBuilderNode(mergedState);

  return {
    decision: injected,
    graph: builderUpdate.currentGraph ?? state.currentGraph ?? EMPTY_GRAPH,
    riskIds: extractRiskIds(mergedState.businessOutput),
  };
}

/** 运行单条用例，产出 CaseResult */
export async function runCase(evalCase: EvalCase, mode: EvalMode): Promise<CaseResult> {
  const startedAt = Date.now();
  let decision: TaskDistributionLike = {
    taskDescription: '',
    needsCompanyInfo: false,
    needsGraph: false,
    needsBusiness: false,
    reasoning: '',
  };
  let graph: GraphData = EMPTY_GRAPH;
  let riskIds: string[] = [];
  let error: string | undefined;

  try {
    const result =
      mode === 'llm' ? await runWithLLM(evalCase) : await runWithInjectedDecision(evalCase);
    decision = result.decision;
    graph = result.graph;
    riskIds = result.riskIds;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const decisionCorrect = error ? false : computeDecisionCorrect(decision, evalCase.expectedAgents);

  return {
    caseId: evalCase.id,
    caseName: evalCase.name,
    query: evalCase.query,
    mode,
    decision,
    decisionCorrect,
    graph,
    nodeHitRate: computeHitRate(
      graph.nodes.map((n) => n.id),
      evalCase.expectedGraphNodes,
    ),
    edgeHitRate: computeHitRate(
      graph.edges.map((e) => `${e.source}->${e.target}`),
      evalCase.expectedGraphEdges?.map(([s, t]) => `${s}->${t}`),
    ),
    riskMatchRate: computeHitRate(riskIds, evalCase.expectedRisks),
    durationMs: Date.now() - startedAt,
    error,
  };
}

/** 运行完整数据集 */
export async function runDataset(
  cases: EvalCase[],
  mode: EvalMode,
): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  // 逐条执行：多 Agent 服务并发压力可控，且日志按序可读
  for (const evalCase of cases) {
    results.push(await runCase(evalCase, mode));
  }
  return results;
}
