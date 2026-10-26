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
  it('LLM 决策字段透传，企业相关查询强制激活三个 Worker 并补全查询语句', async () => {
    mocks.invoke.mockResolvedValue({
      taskDescription: '查询星辰智能',
      needsCompanyInfo: true,
      companyQuery: '查询星辰智能基本信息',
      needsGraph: false,
      graphQuery: null,
      needsBusiness: false,
      businessQuery: null,
      reasoning: '仅需企业信息',
    });

    const result = await supervisorNode(makeState({ supervisorTask: '查询星辰智能' }));

    expect(result.needsCompanyInfo).toBe(true);
    expect(result.companyQuery).toBe('查询星辰智能基本信息');
    expect(result.needsGraph).toBe(true);
    expect(result.graphQuery).toBe('查询星辰智能 的关联企业、股权结构与任职关系');
    expect(result.needsBusiness).toBe(true);
    expect(result.businessQuery).toBe(
      '查询星辰智能 的工商变更、风险、企业需求、网络舆情与财务情况',
    );
    expect(result.supervisorTask).toBe('查询星辰智能');
    expect(result.reasoning).toBe('仅需企业信息');
  });

  it('仅命中图谱 Worker 时同样激活全部 Worker（整体报告）', async () => {
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
    expect(result.needsBusiness).toBe(true);
  });

  it('与企业无关的查询保持全部不激活', async () => {
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

    expect(result.needsCompanyInfo).toBe(false);
    expect(result.companyQuery).toBeUndefined();
    expect(result.needsGraph).toBe(false);
    expect(result.graphQuery).toBeUndefined();
    expect(result.needsBusiness).toBe(false);
    expect(result.businessQuery).toBeUndefined();
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
