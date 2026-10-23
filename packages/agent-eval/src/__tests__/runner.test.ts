import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRelations } from '@ai/shared';
import { extractRiskIds, runCase, runDataset } from '../runner/runner';
import type { EvalCase } from '../types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubAgentFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request) => {
      const href = typeof url === 'string' ? url : url.toString();
      const json = (data: unknown) =>
        ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;
      if (href.includes('3001')) {
        return json({
          id: 'e1',
          name: '星辰智能科技集团',
          legalPerson: '张明远',
          status: '存续',
        });
      }
      if (href.includes('3002')) {
        return json(getRelations('e1'));
      }
      if (href.includes('3003')) {
        return json([
          { id: 'risk1', enterpriseId: 'e1', type: '经营异常', level: 'yellow', date: '2025-08-12', detail: 'd1', source: 's' },
          { id: 'risk2', enterpriseId: 'e1', type: '行政处罚', level: 'red', date: '2025-11-03', detail: 'd2', source: 's' },
        ]);
      }
      throw new Error(`未预期的请求: ${href}`);
    }),
  );
}

const allActiveCase: EvalCase = {
  id: 'test-all',
  name: '综合查询',
  query: '查一下星辰智能科技集团的基本信息、关联图谱和风险情况',
  expectedAgents: { needsCompanyInfo: true, needsGraph: true, needsBusiness: true },
  expectedGraphNodes: ['e1', 'p1', 'e3', 'e4', 'e2'],
  expectedGraphEdges: [
    ['p1', 'e1'],
    ['e3', 'e1'],
    ['e3', 'e2'],
    ['e1', 'e4'],
    ['e1', 'e2'],
    ['p1', 'e4'],
  ],
  expectedRisks: ['risk1', 'risk2'],
  injectedDecision: {
    taskDescription: '综合查询星辰智能科技集团',
    needsCompanyInfo: true,
    companyQuery: '星辰智能科技集团的基本信息',
    needsGraph: true,
    graphQuery: '星辰智能科技集团的关联图谱',
    needsBusiness: true,
    businessQuery: '星辰智能科技集团的风险情况',
    reasoning: 'test 注入',
  },
};

const idleCase: EvalCase = {
  id: 'test-idle',
  name: '模糊查询',
  query: '帮我查个公司',
  expectedAgents: { needsCompanyInfo: false, needsGraph: false, needsBusiness: false },
  injectedDecision: {
    taskDescription: '模糊查询',
    needsCompanyInfo: false,
    needsGraph: false,
    needsBusiness: false,
    reasoning: 'test 注入',
  },
};

describe('extractRiskIds', () => {
  it('解析 RiskItem 数组提取 id', () => {
    const out = JSON.stringify([
      { id: 'risk1', enterpriseId: 'e1' },
      { id: 'risk2', enterpriseId: 'e1' },
    ]);
    expect(extractRiskIds(out)).toEqual(['risk1', 'risk2']);
  });

  it('非数组输出返回空（graph-builder 同款兜底）', () => {
    expect(extractRiskIds('{}')).toEqual([]);
    expect(extractRiskIds('"str"')).toEqual([]);
  });

  it('坏 JSON 返回空不抛错', () => {
    expect(extractRiskIds('not-json{')).toEqual([]);
  });

  it('元素缺 id 字段时跳过', () => {
    const out = JSON.stringify([{ foo: 1 }, { id: 'risk9' }]);
    expect(extractRiskIds(out)).toEqual(['risk9']);
  });
});

describe('runCase（skip-llm 模式）', () => {
  it('注入决策驱动全链路：决策正确 + 图谱命中 + 风险全匹配', async () => {
    stubAgentFetch();
    const result = await runCase(allActiveCase, 'skip-llm');

    expect(result.error).toBeUndefined();
    expect(result.decisionCorrect).toBe(true);
    expect(result.mode).toBe('skip-llm');
    expect(result.nodeHitRate).toBe(1);
    expect(result.edgeHitRate).toBe(1);
    expect(result.riskMatchRate).toBe(1);
    expect(result.graph.nodes.map((n) => n.id).sort()).toEqual(
      ['e1', 'e2', 'e3', 'e4', 'p1'].sort(),
    );
  });

  it('无 Worker 激活时不发请求，图谱为空', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await runCase(idleCase, 'skip-llm');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.decisionCorrect).toBe(true);
    expect(result.graph).toEqual({ nodes: [], edges: [] });
    expect(result.nodeHitRate).toBe(1);
  });

  it('决策与期望不符时 decisionCorrect=false', async () => {
    stubAgentFetch();
    const badCase: EvalCase = {
      ...allActiveCase,
      id: 'test-bad-decision',
      expectedAgents: { needsCompanyInfo: false, needsGraph: false, needsBusiness: false },
    };
    const result = await runCase(badCase, 'skip-llm');
    expect(result.decisionCorrect).toBe(false);
  });

  it('缺少 injectedDecision 时该用例记录错误不抛出', async () => {
    const noDecisionCase: EvalCase = {
      id: 'test-no-decision',
      name: '缺注入',
      query: 'q',
      expectedAgents: { needsCompanyInfo: true, needsGraph: false, needsBusiness: false },
    };
    const result = await runCase(noDecisionCase, 'skip-llm');
    expect(result.error).toContain('injectedDecision');
    expect(result.decisionCorrect).toBe(false);
  });

  it('Agent 服务不可用时错误降级，用例不中断', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection refused');
      }),
    );
    const result = await runCase(allActiveCase, 'skip-llm');
    // adapter 内部 try/catch 降级：不抛错，但风险匹配失败
    expect(result.error).toBeUndefined();
    expect(result.riskMatchRate).toBe(0);
  });
});

describe('runDataset', () => {
  it('按顺序执行全部用例并返回结果', async () => {
    stubAgentFetch();
    const results = await runDataset([allActiveCase, idleCase], 'skip-llm');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.caseId)).toEqual(['test-all', 'test-idle']);
  });
});
