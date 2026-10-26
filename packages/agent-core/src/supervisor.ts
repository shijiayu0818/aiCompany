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

系统支持的功能范围：
- 查询企业基本信息、股权结构、关联企业、对外投资
- 查询企业工商变更、风险等级、经营异常、司法风险
- 查询企业网络舆情、财务快照

决策规则：
- 根据用户查询的意图，选择需要激活的 Agent（可多选）。
- needsCompanyInfo：查询涉及具体企业时激活（包括用户仅输入企业名称）。企业信息是生成整体报告的主体，企业相关查询必须激活。
- needsGraph：仅当查询涉及以下内容时激活，否则为 false：
  * 股权结构、股东、持股比例
  * 关联企业、子公司、对外投资、投资布局
  * 企业关键人物：法定代表人、股东、高管、董监高、实际控制人、受益所有人、任职关系
  * 用户仅输入企业名称（视为查询企业本身，激活）
  * 纯属性查询（如只问舆情、财务、风险明细、变更记录）不激活
- needsBusiness：查询涉及风险、工商变更、经营异常、司法风险、行政处罚、网络舆情、财务情况时激活。
- companyQuery 和 businessQuery 必须只包含企业名称本身（如「阿里巴巴集团」「企查查科技股份有限公司」），禁止附加「查询」「的基本信息」等任何说明文字。
- 如果查询的是企业关键人物（如"张勇是谁""阿里的法人"），needsGraph 必须为 true；若能从上下文推断出所属企业，companyQuery/businessQuery 填该企业名。
- 如果查询不是企业数据请求（如问候、闲聊、功能咨询、无对应数据源的请求），设置 directResponse 为友好回复文本，同时 needsCompanyInfo/needsGraph/needsBusiness 全设为 false。
- 设置 directResponse 的典型场景：
  * 问候/闲聊：「你好」「在吗」→ directResponse = 友好问候 + 功能介绍
  * 功能咨询：「我还能问什么」「你能做什么」→ directResponse = 列出支持的功能
  * 无对应数据源：「拜访须知」「联系电话」「招聘信息」→ directResponse = 「暂时没有该功能或该数据」
  * 模糊查询未提供企业名：「查个公司」「帮我查一下」→ directResponse = 请用户补充企业名称
- 如果用户查询模糊但能识别企业名称（如"查星辰科技的变更"），仍然输出决策，不要设置 directResponse。
- 为每个激活的 Agent 生成明确的查询语句。
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

  // 有 directResponse → 直接回复，跳过所有 Agent
  if (response.directResponse) {
    return {
      supervisorTask: response.taskDescription,
      needsCompanyInfo: false,
      needsGraph: false,
      needsBusiness: false,
      directResponse: response.directResponse,
      reasoning: response.reasoning,
    };
  }

  // 按需透传 LLM 决策（needsGraph/needsBusiness 按查询意图激活）
  // company 是报告主体：非 directResponse 查询一律激活（含 LLM 漏标兜底）
  const needsCompany = true;

  return {
    supervisorTask: response.taskDescription,
    needsCompanyInfo: needsCompany,
    // LLM 结构化输出中 nullable 字段可能为 null，归一为 state 的 undefined 语义
    companyQuery: response.companyQuery ?? query,
    needsGraph: response.needsGraph,
    graphQuery: response.needsGraph
      ? (response.graphQuery ?? `${query}的关联企业、股权结构与任职关系`)
      : undefined,
    needsBusiness: response.needsBusiness,
    businessQuery: response.needsBusiness
      ? (response.businessQuery ??
        `${query}的工商变更、风险、企业需求、网络舆情与财务情况`)
      : undefined,
    reasoning: response.reasoning,
  };
}
