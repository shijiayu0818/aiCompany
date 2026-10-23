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
    needsGraph: false,
    graphQuery: undefined,
    needsBusiness: false,
    businessQuery: undefined,
    reasoning: '',
    companyOutput: '',
    graphOutput: '',
    businessOutput: '',
    currentGraph: undefined,
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

const risksJson = JSON.stringify([
  { id: 'risk1', enterpriseId: 'e1', type: '经营异常', level: 'yellow' },
  { id: 'risk2', enterpriseId: 'e1', type: '行政处罚', level: 'red' },
]);

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
});
