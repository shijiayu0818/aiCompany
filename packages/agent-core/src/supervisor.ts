import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { getLLMConfig } from '@ai/shared';
import type { SupervisorState } from './state';
import { TaskDistributionSchema, type TaskDistribution } from './entities';

/**
 * 创建 LLM 实例（从环境变量读取配置）
 */
function createLLM() {
  const config = getLLMConfig();
  return new ChatOpenAI({
    apiKey: config.apiKey,
    configuration: { baseURL: config.baseURL },
    model: config.model,
    temperature: 0,
  });
}

const SUPERVISOR_SYSTEM_PROMPT = `你是企业智能助手的调度主管（Supervisor）。
你的任务是分析用户的自然语言查询，决定需要激活哪些子 Agent 来完成任务。

可选的子 Agent：
1. 企业信息 Agent（company）：查询企业基本信息，包括名称、法人、注册资本、成立日期、经营状态、行业、地区等。
2. 客户图谱 Agent（graph）：查询企业关联关系，包括股权结构、子公司、对外投资、任职关系、实际控制人等。
3. 工商资料 Agent（business）：查询工商变更记录、经营异常、司法风险、行政处罚等风险信息。

决策规则：
- 根据用户查询的意图，选择需要激活的 Agent（可多选）。
- 只要查询涉及具体企业（包括用户仅输入企业名称），必须同时激活三个 Agent，以生成包含企业信息、关联企业、风险等级、企业需求、网络舆情、财务情况的整体查询报告。禁止只激活其中一个或两个。
- 仅当查询与企业无关（如问候、闲聊）时，才可以全部不激活。
- 为每个激活的 Agent 生成明确的查询语句。
- 如果用户查询模糊（如"查个公司"），仍然输出决策，但在 reasoning 中说明需要用户补充企业名称。
- 如果是多轮对话，结合历史消息理解上下文指代（如"它"、"这个公司"指的是上一轮提到的企业）。

请按结构化格式输出决策结果。`;

export async function supervisorNode(
  state: SupervisorState,
): Promise<Partial<SupervisorState>> {
  const llm = createLLM().withStructuredOutput(TaskDistributionSchema, {
    name: 'task_distribution',
    // DeepSeek 兼容层不支持 json_schema response_format，用 function calling 实现
    method: 'functionCalling',
  });

  const query = state.supervisorTask || 'No task provided';

  // 构建消息：系统提示 + 历史消息 + 当前查询
  const messages = [
    new SystemMessage(SUPERVISOR_SYSTEM_PROMPT),
    ...state.messages.slice(-10), // 取最近 10 条历史，控制上下文长度
    new HumanMessage(query),
  ];

  const response = (await llm.invoke(messages)) as TaskDistribution;

  // 企业相关查询统一激活三个 Worker，确保生成完整的企业整体查询报告
  const needsFullReport =
    response.needsCompanyInfo || response.needsGraph || response.needsBusiness;

  return {
    supervisorTask: response.taskDescription,
    needsCompanyInfo: needsFullReport,
    // LLM 结构化输出中 nullable 字段可能为 null，归一为 state 的 undefined 语义
    companyQuery: needsFullReport
      ? (response.companyQuery ?? query)
      : undefined,
    needsGraph: needsFullReport,
    graphQuery: needsFullReport
      ? (response.graphQuery ?? `${query} 的关联企业、股权结构与任职关系`)
      : undefined,
    needsBusiness: needsFullReport,
    businessQuery: needsFullReport
      ? (response.businessQuery ??
        `${query} 的工商变更、风险、企业需求、网络舆情与财务情况`)
      : undefined,
    reasoning: response.reasoning,
  };
}
