import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

const mocks = vi.hoisted(() => {
  const invoke = vi.fn();
  const withStructuredOutput = vi.fn(() => ({ invoke }));
  return { invoke, withStructuredOutput };
});

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn(() => ({ withStructuredOutput: mocks.withStructuredOutput })),
}));

import { supervisorNode } from '../supervisor';
import { makeState } from './helpers';

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.withStructuredOutput.mockClear();
  vi.stubEnv('LLM_API_KEY', 'test-key');
  vi.stubEnv('LLM_BASE_URL', 'https://api.test.com/v1');
  vi.stubEnv('LLM_MODEL', 'test-model');
});

describe('supervisorNode', () => {
  it('LLM 决策字段透传：needsGraph/needsBusiness 按意图激活，不强制全开', async () => {
    mocks.invoke.mockResolvedValue({
      taskDescription: '查询星辰智能基本信息',
      needsCompanyInfo: true,
      companyQuery: '星辰智能科技集团',
      needsGraph: false,
      graphQuery: null,
      needsBusiness: false,
      businessQuery: null,
      reasoning: '仅查询基本信息，不涉及关联关系',
    });

    const result = await supervisorNode(makeState({ supervisorTask: '查询星辰智能基本信息' }));

    expect(result.needsCompanyInfo).toBe(true);
    expect(result.companyQuery).toBe('星辰智能科技集团');
    expect(result.needsGraph).toBe(false);
    expect(result.graphQuery).toBeUndefined();
    expect(result.needsBusiness).toBe(false);
    expect(result.businessQuery).toBeUndefined();
    expect(result.supervisorTask).toBe('查询星辰智能基本信息');
    expect(result.reasoning).toBe('仅查询基本信息，不涉及关联关系');
  });

  it('company 兜底：LLM 漏标 company 但 graph 命中时仍激活 company（报告主体）', async () => {
    mocks.invoke.mockResolvedValue({
      taskDescription: '阿里巴巴集团',
      needsCompanyInfo: false,
      companyQuery: null,
      needsGraph: true,
      graphQuery: null,
      needsBusiness: false,
      businessQuery: null,
      reasoning: '需要关联企业',
    });

    const result = await supervisorNode(makeState({ supervisorTask: '阿里巴巴集团' }));

    expect(result.needsCompanyInfo).toBe(true);
    expect(result.companyQuery).toBe('阿里巴巴集团');
    expect(result.needsGraph).toBe(true);
    expect(result.needsBusiness).toBe(false);
  });

  it('directResponse 存在时早退：跳过所有 Agent', async () => {
    mocks.invoke.mockResolvedValue({
      taskDescription: '功能咨询',
      needsCompanyInfo: true,
      companyQuery: null,
      needsGraph: true,
      graphQuery: null,
      needsBusiness: true,
      businessQuery: null,
      reasoning: '用户询问功能',
      directResponse: '暂时没有该功能或该数据',
    });

    const result = await supervisorNode(makeState({ supervisorTask: '有什么拜访须知' }));

    expect(result.directResponse).toBe('暂时没有该功能或该数据');
    expect(result.needsCompanyInfo).toBe(false);
    expect(result.needsGraph).toBe(false);
    expect(result.needsBusiness).toBe(false);
  });

  it('三个全 false 且无 directResponse 时 company 兜底激活（异常防护）', async () => {
    mocks.invoke.mockResolvedValue({
      taskDescription: '问候',
      needsCompanyInfo: false,
      companyQuery: null,
      needsGraph: false,
      graphQuery: null,
      needsBusiness: false,
      businessQuery: null,
      reasoning: '与业务无关',
    });

    const result = await supervisorNode(makeState({ supervisorTask: '你好' }));

    expect(result.needsCompanyInfo).toBe(true);
    expect(result.needsGraph).toBe(false);
    expect(result.needsBusiness).toBe(false);
  });

  it('withStructuredOutput 使用 functionCalling 方法（DeepSeek 兼容）', async () => {
    mocks.invoke.mockResolvedValue({
      taskDescription: 't',
      needsCompanyInfo: false,
      companyQuery: null,
      needsGraph: false,
      graphQuery: null,
      needsBusiness: false,
      businessQuery: null,
      reasoning: 'r',
    });

    await supervisorNode(makeState());

    expect(mocks.withStructuredOutput).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'functionCalling' }),
    );
  });

  it('消息构造：系统提示 + 最近 10 条历史 + 当前查询', async () => {
    mocks.invoke.mockResolvedValue({
      taskDescription: 't',
      needsCompanyInfo: false,
      companyQuery: null,
      needsGraph: false,
      graphQuery: null,
      needsBusiness: false,
      businessQuery: null,
      reasoning: 'r',
    });

    const history = Array.from(
      { length: 12 },
      (_, i) => new AIMessage(`历史消息${i}`),
    );
    await supervisorNode(makeState({ supervisorTask: '最新问题', messages: history }));

    const messages = mocks.invoke.mock.calls[0][0];
    expect(messages[0]).toBeInstanceOf(SystemMessage);
    // 12 条历史只取最近 10 条（历史消息2..11），末尾为当前查询
    expect(messages).toHaveLength(12);
    expect((messages[1] as AIMessage).content).toBe('历史消息2');
    expect((messages[10] as AIMessage).content).toBe('历史消息11');
    const last = messages[11] as HumanMessage;
    expect(last).toBeInstanceOf(HumanMessage);
    expect(last.content).toBe('最新问题');
  });

  it('supervisorTask 为空时查询回退为 No task provided', async () => {
    mocks.invoke.mockResolvedValue({
      taskDescription: 't',
      needsCompanyInfo: false,
      companyQuery: null,
      needsGraph: false,
      graphQuery: null,
      needsBusiness: false,
      businessQuery: null,
      reasoning: 'r',
    });

    await supervisorNode(makeState({ supervisorTask: '' }));

    const messages = mocks.invoke.mock.calls[0][0];
    const last = messages[messages.length - 1] as HumanMessage;
    expect(last.content).toBe('No task provided');
  });
});
