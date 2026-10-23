import { StateGraph, START, END, MemorySaver } from '@langchain/langgraph';
import { SupervisorStateAnnotation, type SupervisorState } from './state';
import { supervisorNode } from './supervisor';
import { companyAdapter } from './adapters/company-adapter';
import { graphAdapter } from './adapters/graph-adapter';
import { businessAdapter } from './adapters/business-adapter';
import { graphBuilderNode } from './graph-builder';

/**
 * 构建企业智能助手 LangGraph 图
 *
 * 流程：
 * START → supervisor → [条件路由] → company/graph/business 并行 → graph-builder → END
 *
 * @param options.checkpointer 会话持久化（MemorySaver），用于多轮对话
 */
export function buildAgentGraph(options?: { checkpointer?: MemorySaver }) {
  const workflow = new StateGraph(SupervisorStateAnnotation)
    .addNode('supervisor', supervisorNode)
    .addNode('company_node', companyAdapter)
    .addNode('graph_node', graphAdapter)
    .addNode('business_node', businessAdapter)
    .addNode('graph_builder', graphBuilderNode)

    .addEdge(START, 'supervisor')

    // 条件路由：Supervisor 决策激活哪些 Worker
    .addConditionalEdges('supervisor', (state: SupervisorState) => {
      const nextNodes: string[] = [];
      if (state.needsCompanyInfo) nextNodes.push('company_node');
      if (state.needsGraph) nextNodes.push('graph_node');
      if (state.needsBusiness) nextNodes.push('business_node');

      // 如果一个 Worker 都没激活，直接进图谱组装
      if (nextNodes.length === 0) return ['graph_builder'];
      return nextNodes;
    }, {
      company_node: 'company_node',
      graph_node: 'graph_node',
      business_node: 'business_node',
      graph_builder: 'graph_builder',
    })

    // Worker → 图谱组装器
    .addEdge('company_node', 'graph_builder')
    .addEdge('graph_node', 'graph_builder')
    .addEdge('business_node', 'graph_builder')

    .addEdge('graph_builder', END);

  return workflow.compile({
    name: 'EnterpriseAssistantGraph',
    checkpointer: options?.checkpointer,
  });
}

/**
 * 创建带默认 MemorySaver 的图（多轮对话）
 */
export function createGraph() {
  return buildAgentGraph({ checkpointer: new MemorySaver() });
}
