import { describe, it, expect } from 'vitest';
import { graphBuilderNode } from '../graph-builder';
import type { SupervisorState } from '../state';
import type { GraphData } from '@ai/shared';

/** 构造最小可用的 SupervisorState 测试夹具 */
function makeState(overrides: Partial<SupervisorState> = {}): SupervisorState {
  return {
    messages: [],
    supervisorTask: '测试查询',
    threadId: undefined,
    needsCompanyInfo: false,
    companyQuery: undefined,
    needsGraph: true,
    graphQuery: undefined,
    needsBusiness: false,
    businessQuery: undefined,
    reasoning: '',
    directResponse: undefined,
    companyOutput: '',
    graphOutput: '',
    businessOutput: '',
    currentGraph: undefined,
    currentReport: undefined,
    ...overrides,
  };
}

/** 两企业一人的标准图谱夹具 */
function makeGraphOutput(): string {
  return JSON.stringify({
    nodes: [
      { id: 'e1', type: 'enterprise', name: '星辰智能科技集团', refId: 'e1', meta: '人工智能' },
      { id: 'e2', type: 'enterprise', name: '云链数据科技有限公司', refId: 'e2', meta: '大数据' },
      { id: 'p1', type: 'person', name: '张明远' },
    ],
    edges: [{ id: 'r1', source: 'p1', target: 'e1', type: '法定代表人', label: '董事长' }],
  } satisfies GraphData);
}

const companyJson = JSON.stringify({
  id: 'e1',
  name: '星辰智能科技集团',
  legalPerson: '张明远',
});

const risksJson = JSON.stringify({
  risks: [
    { id: 'risk1', enterpriseId: 'e1', type: '经营异常', level: 'yellow', date: '2025-08-12', detail: 'd1', source: 's1' },
    { id: 'risk2', enterpriseId: 'e1', type: '行政处罚', level: 'red', date: '2025-11-03', detail: 'd2', source: 's2' },
  ],
  needs: [
    {
      id: 'need1',
      enterpriseId: 'e1',
      type: '融资需求',
      title: 'B 轮融资',
      description: '用于研发投入',
      priority: 'high',
    },
  ],
  opinions: [
    {
      id: 'op1',
      enterpriseId: 'e1',
      title: '发布新产品',
      summary: '获得市场关注',
      sentiment: 'positive',
      source: '科技日报',
      date: '2026-06-01',
    },
    {
      id: 'op2',
      enterpriseId: 'e1',
      title: '合同纠纷报道',
      summary: '涉及合同纠纷',
      sentiment: 'negative',
      source: '财经网',
      date: '2026-07-01',
    },
  ],
  financials: [
    {
      enterpriseId: 'e1',
      year: 2025,
      revenue: '26.3亿元',
      netProfit: '3.8亿元',
      totalAssets: '55.4亿元',
      totalLiabilities: '19.2亿元',
      debtRatio: 34.7,
      cashFlow: '4.6亿元',
      currency: 'CNY',
    },
  ],
});

const companyProfileJson = JSON.stringify({
  id: 'e1',
  name: '星辰智能科技集团',
  legalPerson: '张明远',
  creditCode: '91110000MA01XK7D2Y',
  registeredCapital: '50000万元',
  establishDate: '2015-03-15',
  status: '存续',
  industry: '人工智能',
  region: '北京',
  changeHistory: [
    { id: 'c1', enterpriseId: 'e1', type: '法定代表人变更', date: '2026-02-14' },
    { id: 'c2', enterpriseId: 'e1', type: '股东变更', date: '2026-04-01' },
    { id: 'c3', enterpriseId: 'e1', type: '股东变更', date: '2026-05-01' },
    { id: 'c4', enterpriseId: 'e1', type: '股东变更', date: '2026-06-01' },
    { id: 'c5', enterpriseId: 'e1', type: '经营范围变更', date: '2026-07-01' },
  ],
  riskFlags: [
    {
      code: 'FREQUENT_CHANGE',
      label: '高频变更',
      level: 'red',
      detail: '近 12 个月累计变更 5 次',
    },
  ],
});

describe('graphBuilderNode', () => {
  it('graphOutput 有效时组装图谱', async () => {
    const result = await graphBuilderNode(makeState({ graphOutput: makeGraphOutput() }));

    expect(result.currentGraph).toBeDefined();
    expect(result.currentGraph!.nodes).toHaveLength(3);
    expect(result.currentGraph!.edges).toHaveLength(1);
  });

  it('风险按 enterpriseId 与 refId 精确匹配，标记为 风险N条', async () => {
    const result = await graphBuilderNode(
      makeState({ graphOutput: makeGraphOutput(), businessOutput: risksJson }),
    );

    const e1 = result.currentGraph!.nodes.find((n) => n.id === 'e1');
    const e2 = result.currentGraph!.nodes.find((n) => n.id === 'e2');
    expect(e1!.meta).toBe('风险2条');
    // 回归用例：无风险的企业不得误标（曾因宽匹配导致全节点标风险）
    expect(e2!.meta).toBe('大数据');
  });

  it('companyOutput 名称匹配节点时附加 detail', async () => {
    const result = await graphBuilderNode(
      makeState({ graphOutput: makeGraphOutput(), companyOutput: companyJson }),
    );

    const e1 = result.currentGraph!.nodes.find((n) => n.id === 'e1');
    const e2 = result.currentGraph!.nodes.find((n) => n.id === 'e2');
    expect(e1!.detail).toBe(companyJson);
    expect(e2!.detail).toBeUndefined();
  });

  it('businessOutput 非法 JSON 时不影响组装', async () => {
    const result = await graphBuilderNode(
      makeState({ graphOutput: makeGraphOutput(), businessOutput: 'not-json' }),
    );

    const e1 = result.currentGraph!.nodes.find((n) => n.id === 'e1');
    expect(result.currentGraph!.nodes).toHaveLength(3);
    expect(e1!.meta).toBe('人工智能');
  });

  it('graphOutput 为空且 companyOutput 有效时回退为单节点图', async () => {
    const result = await graphBuilderNode(
      makeState({ companyOutput: companyJson }),
    );

    expect(result.currentGraph!.nodes).toHaveLength(1);
    expect(result.currentGraph!.nodes[0]).toMatchObject({
      id: 'e1',
      type: 'enterprise',
      name: '星辰智能科技集团',
    });
    expect(result.currentGraph!.edges).toHaveLength(0);
  });

  it('graphOutput 与 companyOutput 均无效时维持原图谱', async () => {
    const existing: GraphData = {
      nodes: [{ id: 'keep', type: 'enterprise', name: '保留节点' }],
      edges: [],
    };
    const result = await graphBuilderNode(
      makeState({ graphOutput: 'not-json', currentGraph: existing }),
    );

    expect(result.currentGraph).toEqual(existing);
  });

  it('回退单节点时与已有图谱增量合并', async () => {
    const existing: GraphData = {
      nodes: [{ id: 'e9', type: 'enterprise', name: '历史企业' }],
      edges: [],
    };
    const result = await graphBuilderNode(
      makeState({ companyOutput: companyJson, currentGraph: existing }),
    );

    const ids = result.currentGraph!.nodes.map((n) => n.id);
    expect(ids).toContain('e9');
    expect(ids).toContain('e1');
  });

  it('回退路径：企业数据无 id 时节点 id 回退为 unknown', async () => {
    const result = await graphBuilderNode(
      makeState({ companyOutput: JSON.stringify({ name: '无名企业' }) }),
    );

    expect(result.currentGraph!.nodes[0].id).toBe('unknown');
  });

  it('增量合并按 id 去重，重复节点与边不重复保留', async () => {
    const existing: GraphData = {
      nodes: [
        { id: 'e1', type: 'enterprise', name: '星辰智能科技集团', refId: 'e1' },
        { id: 'e2', type: 'enterprise', name: '云链数据科技有限公司', refId: 'e2' },
      ],
      edges: [{ id: 'r1', source: 'p1', target: 'e1', type: '法定代表人' }],
    };
    const result = await graphBuilderNode(
      makeState({ graphOutput: makeGraphOutput(), currentGraph: existing }),
    );

    const nodeIds = result.currentGraph!.nodes.map((n) => n.id);
    const edgeIds = result.currentGraph!.edges.map((e) => e.id);
    // e1/e2/r1 重复，应只保留一份；p1 为新增
    expect(nodeIds.filter((id) => id === 'e1')).toHaveLength(1);
    expect(nodeIds.filter((id) => id === 'e2')).toHaveLength(1);
    expect(edgeIds.filter((id) => id === 'r1')).toHaveLength(1);
    expect(nodeIds).toContain('p1');
    expect(result.currentGraph!.nodes).toHaveLength(3);
  });

  it('currentGraph 为空时直接采用新图谱', async () => {
    const result = await graphBuilderNode(
      makeState({ graphOutput: makeGraphOutput() }),
    );

    expect(result.currentGraph!.nodes.map((n) => n.id)).toEqual(['e1', 'e2', 'p1']);
  });

  it('graphOutput 无节点时同样走回退路径', async () => {
    const result = await graphBuilderNode(
      makeState({
        graphOutput: JSON.stringify({ nodes: [], edges: [] }),
        companyOutput: companyJson,
      }),
    );

    expect(result.currentGraph!.nodes).toHaveLength(1);
    expect(result.currentGraph!.nodes[0].name).toBe('星辰智能科技集团');
  });

  it('回归：graphOutput 缺 nodes 字段（如空对象）时崩溃修复为走回退路径', async () => {
    const result = await graphBuilderNode(
      makeState({ graphOutput: '{}', companyOutput: companyJson }),
    );

    expect(result.currentGraph!.nodes).toHaveLength(1);
    expect(result.currentGraph!.nodes[0].id).toBe('e1');
  });

  it('汇总生成整体报告：企业信息、预警、关联企业、风险评级、需求/舆情/财务', async () => {
    const graphOutput = JSON.stringify({
      nodes: [
        { id: 'e1', type: 'enterprise', name: '星辰智能科技集团', refId: 'e1', meta: '人工智能', detail: '北京' },
        { id: 'e2', type: 'enterprise', name: '云链数据科技有限公司', refId: 'e2', meta: '大数据', detail: '上海' },
        { id: 'e3', type: 'enterprise', name: '鸿图资本管理有限公司', refId: 'e3', meta: '投资管理', detail: '深圳' },
      ],
      edges: [
        { id: 'r1', source: 'e1', target: 'e2', type: '投资', label: '25%' },
        { id: 'r2', source: 'e3', target: 'e1', type: '投资', label: '10%' },
      ],
    });

    const result = await graphBuilderNode(
      makeState({
        graphOutput,
        companyOutput: companyProfileJson,
        businessOutput: risksJson,
      }),
    );

    const report = result.currentReport!;
    expect(report).toBeDefined();
    expect(report.enterprise.name).toBe('星辰智能科技集团');
    expect(report.changes).toHaveLength(5);
    expect(report.flags.map((flag) => flag.code)).toContain('FREQUENT_CHANGE');
    expect(report.relatedEnterprises).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'e2',
          relation: '投资',
          label: '25%',
          industry: '大数据',
          region: '上海',
        }),
        expect.objectContaining({
          id: 'e3',
          relation: '投资',
          label: '10%',
          industry: '投资管理',
          region: '深圳',
        }),
      ]),
    );
    expect(report.risks).toHaveLength(2);
    expect(report.needs).toHaveLength(1);
    expect(report.opinions).toHaveLength(2);
    expect(report.financials).toHaveLength(1);
    expect(report.riskAssessment).toMatchObject({
      redCount: 1,
      yellowCount: 1,
      score: 32,
      grade: 'B',
      level: 'yellow',
    });
    expect(report.generatedAt).toBeTruthy();
  });

  it('企业信息未携带预警时按变更记录重新计算', async () => {
    const now = new Date();
    const daysAgo = (days: number) =>
      new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
    const profile = JSON.stringify({
      id: 'e1',
      name: '星辰智能科技集团',
      legalPerson: '张明远',
      creditCode: '91110000MA01XK7D2Y',
      registeredCapital: '50000万元',
      establishDate: '2015-03-15',
      status: '存续',
      industry: '人工智能',
      region: '北京',
      changeHistory: [
        { id: 'c1', enterpriseId: 'e1', type: '股东变更', date: daysAgo(30) },
        { id: 'c2', enterpriseId: 'e1', type: '股东变更', date: daysAgo(60) },
        { id: 'c3', enterpriseId: 'e1', type: '股东变更', date: daysAgo(90) },
        { id: 'c4', enterpriseId: 'e1', type: '经营范围变更', date: daysAgo(120) },
        { id: 'c5', enterpriseId: 'e1', type: '注册资本变更', date: daysAgo(150) },
      ],
    });

    const result = await graphBuilderNode(
      makeState({ companyOutput: profile }),
    );

    expect(result.currentReport!.flags.map((flag) => flag.code)).toEqual([
      'FREQUENT_CHANGE',
      'FREQUENT_SHAREHOLDER',
    ]);
  });

  it('多轮查询仅更新工商资料时保留已有企业主体并刷新风险数据', async () => {
    const first = await graphBuilderNode(
      makeState({
        graphOutput: makeGraphOutput(),
        companyOutput: companyProfileJson,
        businessOutput: risksJson,
      }),
    );

    const second = await graphBuilderNode(
      makeState({
        companyOutput: '',
        graphOutput: '',
        businessOutput: JSON.stringify({
          risks: [
            { id: 'risk9', enterpriseId: 'e1', type: '新增风险', level: 'red', date: '2026-10-01', detail: 'd9', source: 's9' },
          ],
          needs: [],
          opinions: [],
          financials: [],
        }),
        currentGraph: first.currentGraph,
        currentReport: first.currentReport,
      }),
    );

    const report = second.currentReport!;
    expect(report.enterprise.name).toBe('星辰智能科技集团');
    expect(report.risks.map((risk) => risk.id)).toEqual(['risk9']);
    expect(report.riskAssessment.redCount).toBe(1);
    expect(report.riskAssessment.yellowCount).toBe(0);
  });
});
