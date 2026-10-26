import { describe, it, expect, vi, beforeEach } from 'vitest';

const nodeMocks = vi.hoisted(() => ({
  supervisor: vi.fn(),
  company: vi.fn(),
  graph: vi.fn(),
  business: vi.fn(),
}));

vi.mock('../supervisor', () => ({ supervisorNode: nodeMocks.supervisor }));
vi.mock('../adapters/company-adapter', () => ({ companyAdapter: nodeMocks.company }));
vi.mock('../adapters/graph-adapter', () => ({ graphAdapter: nodeMocks.graph }));
vi.mock('../adapters/business-adapter', () => ({ businessAdapter: nodeMocks.business }));

import { buildAgentGraph, createGraph } from '../agent';

const noopDecision = {
  taskDescription: '',
  needsCompanyInfo: false,
  companyQuery: undefined,
  needsGraph: false,
  graphQuery: undefined,
  needsBusiness: false,
  businessQuery: undefined,
  reasoning: '',
};

beforeEach(() => {
  nodeMocks.supervisor.mockReset();
  nodeMocks.company.mockReset();
  nodeMocks.graph.mockReset();
  nodeMocks.business.mockReset();
});

describe('buildAgentGraph 条件路由', () => {
  it('全部未激活时直达 graph_builder，不执行任何 Worker', async () => {
    nodeMocks.supervisor.mockResolvedValue({ ...noopDecision });

    const graph = buildAgentGraph();
    const result = await graph.invoke({ supervisorTask: '你好', messages: [] });

    expect(nodeMocks.company).not.toHaveBeenCalled();
    expect(nodeMocks.graph).not.toHaveBeenCalled();
    expect(nodeMocks.business).not.toHaveBeenCalled();
    expect(result.currentGraph).toBeUndefined();
  });

  it('仅激活 company：graph_builder 不组装图谱，currentGraph 为空', async () => {
    nodeMocks.supervisor.mockResolvedValue({
      ...noopDecision,
      needsCompanyInfo: true,
      companyQuery: '查询星辰智能',
    });
    nodeMocks.company.mockResolvedValue({
      companyOutput: JSON.stringify({ id: 'e1', name: '星辰智能科技集团' }),
    });

    const graph = buildAgentGraph();
    const result = await graph.invoke({ supervisorTask: '查询星辰智能', messages: [] });

    expect(nodeMocks.company.mock.calls[0][0]).toEqual(
      expect.objectContaining({ supervisorTask: '查询星辰智能' }),
    );
    expect(nodeMocks.graph).not.toHaveBeenCalled();
    expect(nodeMocks.business).not.toHaveBeenCalled();
    // needsGraph=false：不生成图谱（前端不展示图谱区）
    expect(result.currentGraph).toBeUndefined();
  });

  it('三个 Worker 全激活：全部执行并汇聚组装图谱', async () => {
    nodeMocks.supervisor.mockResolvedValue({
      ...noopDecision,
      needsCompanyInfo: true,
      companyQuery: 'q1',
      needsGraph: true,
      graphQuery: 'q2',
      needsBusiness: true,
      businessQuery: 'q3',
    });
    nodeMocks.company.mockResolvedValue({
      companyOutput: JSON.stringify({ id: 'e1', name: '星辰智能科技集团' }),
    });
    nodeMocks.graph.mockResolvedValue({
      graphOutput: JSON.stringify({
        nodes: [{ id: 'e1', type: 'enterprise', name: '星辰智能科技集团', refId: 'e1' }],
        edges: [],
      }),
    });
    nodeMocks.business.mockResolvedValue({
      businessOutput: JSON.stringify({
        risks: [
          { id: 'risk1', enterpriseId: 'e1', type: '经营异常', level: 'yellow' },
        ],
        needs: [],
        opinions: [],
        financials: [],
      }),
    });

    const graph = buildAgentGraph();
    const result = await graph.invoke({ supervisorTask: '全面分析', messages: [] });

    expect(nodeMocks.company).toHaveBeenCalled();
    expect(nodeMocks.graph).toHaveBeenCalled();
    expect(nodeMocks.business).toHaveBeenCalled();
    // graph_builder 真实实现：单节点匹配 + 风险标记 + company detail 附加
    const e1 = result.currentGraph!.nodes.find((n) => n.id === 'e1');
    expect(e1!.meta).toBe('风险1条');
    expect(e1!.detail).toBeDefined();
  });

  it('Worker 决策字段正确传递给对应 Adapter', async () => {
    nodeMocks.supervisor.mockResolvedValue({
      ...noopDecision,
      needsCompanyInfo: true,
      companyQuery: '企业查询语句',
      needsGraph: true,
      graphQuery: '图谱查询语句',
    });
    nodeMocks.company.mockResolvedValue({ companyOutput: '{}' });
    nodeMocks.graph.mockResolvedValue({ graphOutput: '{}' });

    const graph = buildAgentGraph();
    await graph.invoke({ supervisorTask: '查询', messages: [] });

    expect(nodeMocks.company.mock.calls[0][0]).toEqual(
      expect.objectContaining({ companyQuery: '企业查询语句' }),
    );
    expect(nodeMocks.graph.mock.calls[0][0]).toEqual(
      expect.objectContaining({ graphQuery: '图谱查询语句' }),
    );
    expect(nodeMocks.business).not.toHaveBeenCalled();
  });

  it('createGraph 默认挂载 MemorySaver 支持多轮', async () => {
    nodeMocks.supervisor.mockResolvedValue({ ...noopDecision });

    const graph = createGraph();
    const config = { configurable: { thread_id: 'm7-test' } };
    await graph.invoke({ supervisorTask: '第一轮', messages: [] }, config);
    const second = await graph.invoke({ supervisorTask: '第二轮', messages: [] }, config);

    // reducer (curr, next) => next ?? curr：第二轮 supervisorTask 被覆盖
    expect(second.supervisorTask).toBe('第二轮');
  });
});
