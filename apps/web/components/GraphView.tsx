'use client';

// G6 力导向图组件（AGENTS.md: 图谱可视化统一走 AntV G6）
// 动态导入 @antv/g6 避免 SSR 模块级 window 引用报错

import { useEffect, useRef } from 'react';
import type { GraphData, GraphNode } from '@ai/shared';
import type { Graph as G6Graph, NodeData, EdgeData } from '@antv/g6';

interface GraphViewProps {
  data: GraphData | null;
  onNodeClick?: (node: GraphNode) => void;
}

/** 从设计系统 CSS 变量读取节点颜色（G6 canvas 不支持 var()） */
function readNodeColors(): Record<string, string> {
  if (typeof window === 'undefined') {
    return { enterprise: '#3b82f6', person: '#10b981', shareholder: '#f59e0b' };
  }
  const cs = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) =>
    cs.getPropertyValue(name).trim() || fallback;
  return {
    enterprise: get('--color-node-enterprise', '#3b82f6'),
    person: get('--color-node-person', '#10b981'),
    shareholder: get('--color-node-shareholder', '#f59e0b'),
  };
}

/** 将业务 GraphData 转换为 G6 数据格式 */
function transformData(data: GraphData) {
  return {
    nodes: data.nodes.map((n) => ({ id: n.id, data: { ...n } })),
    edges: data.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      data: { type: e.type, label: e.label },
    })),
  };
}

export function GraphView({ data, onNodeClick }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<G6Graph | null>(null);
  const callbackRef = useRef(onNodeClick);
  // 初始化是异步的，期间数据可能已到达，用 ref 保证初始化时使用最新数据
  const dataRef = useRef(data);

  // 保持回调引用最新（避免重建图实例）
  useEffect(() => {
    callbackRef.current = onNodeClick;
  });

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // 初始化图实例（仅挂载时）
  useEffect(() => {
    let destroyed = false;

    (async () => {
      if (!containerRef.current) return;
      const { Graph } = await import('@antv/g6');
      if (destroyed || !containerRef.current) return;

      const container = containerRef.current;
      const colors = readNodeColors();

      const graph = new Graph({
        container,
        width: container.clientWidth || 600,
        height: container.clientHeight || 400,
        autoFit: 'view',
        data: dataRef.current ? transformData(dataRef.current) : { nodes: [], edges: [] },
        node: {
          type: 'circle',
          style: (d: NodeData) => {
            const node = (d.data ?? {}) as Partial<GraphNode>;
            return {
              size: node.type === 'enterprise' ? 40 : 28,
              fill:
                node.type === 'enterprise'
                  ? colors.enterprise
                  : node.type === 'person'
                    ? colors.person
                    : colors.shareholder,
              labelText: node.name ?? '',
              labelPlacement: 'bottom',
              labelFontSize: 12,
              labelFill: '#e4e6eb',
            };
          },
        },
        edge: {
          type: 'line',
          style: {
            stroke: '#4b5563',
            labelText: (d: EdgeData) => {
              const edgeData = (d.data ?? {}) as { type?: string; label?: string };
              return edgeData.label ?? edgeData.type ?? '';
            },
            labelFontSize: 10,
            labelFill: '#9ca3af',
          },
        },
        layout: {
          type: 'd3-force',
          manyBody: { strength: -200 },
          link: { distance: 80 },
        },
        behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
      });

      graph.on('node:click', (e: unknown) => {
        const event = e as { target?: { id?: string; data?: GraphNode } };
        const nodeData = event.target?.data;
        if (nodeData) {
          callbackRef.current?.(nodeData);
        }
      });

      await graph.render();
      graphRef.current = graph;
    })();

    return () => {
      destroyed = true;
      graphRef.current?.destroy();
      graphRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 数据更新（增量渲染）
  // 初始化完成前的数据由 dataRef 在创建实例时读取，这里只处理实例已存在的情况
  useEffect(() => {
    if (!graphRef.current || !data) return;
    graphRef.current.setData(transformData(data));
    void graphRef.current.render();
  }, [data]);

  const empty = !data || data.nodes.length === 0;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
        aria-label="企业关联关系图谱"
      />
      {empty && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'var(--font-sm)',
            color: 'var(--color-text-tertiary)',
            pointerEvents: 'none',
          }}
          aria-label="图谱区域（暂无数据）"
        >
          输入查询后，企业关联关系图谱将在此展示
        </div>
      )}
    </div>
  );
}
