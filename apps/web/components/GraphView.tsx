'use client';

// G6 力导向图组件（AGENTS.md: 图谱可视化统一走 AntV G6）
// 动态导入 @antv/g6 避免 SSR 模块级 window 引用报错

import { useEffect, useRef, useState, type CSSProperties } from 'react';
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

/** 工具栏按钮样式（复用设计系统变量） */
const toolButtonStyle: CSSProperties = {
  padding: '4px 10px',
  fontSize: 'var(--font-sm)',
  color: 'var(--color-text-secondary)',
  background: 'var(--color-bg-secondary)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
};

/**
 * 从事件目标向上追溯到节点 id
 * G6 v5 的事件 target 是 DisplayObject（可能命中节点内部的图形），不含业务数据，需按 id 回查
 */
function resolveNodeId(target: unknown, validIds: Set<string>): string | null {
  let current = target as
    | { id?: unknown; parentElement?: unknown; parent?: unknown }
    | null
    | undefined;
  for (let depth = 0; current && depth < 10; depth += 1) {
    const id = current.id;
    if (typeof id === 'string' && validIds.has(id)) return id;
    // G6 v5 的 DisplayObject 用 parentElement，部分图形对象只暴露 parent
    current = (current.parentElement ?? current.parent) as
      | { id?: unknown; parentElement?: unknown; parent?: unknown }
      | null
      | undefined;
  }
  return null;
}

export function GraphView({ data, onNodeClick }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<G6Graph | null>(null);
  const callbackRef = useRef(onNodeClick);
  // 初始化是异步的，期间数据可能已到达，用 ref 保证初始化时使用最新数据
  const dataRef = useRef(data);
  const [exporting, setExporting] = useState(false);

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
        zoomRange: [0.2, 4],
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

      // G6 v5 事件 target 是元素而非业务数据，统一按 id 回查最新业务节点
      graph.on('node:click', (e: unknown) => {
        // 节点数据缺失时不应抛出，静默降级为「无详情」展示
        try {
          const nodes = dataRef.current?.nodes ?? [];
          const nodeId = resolveNodeId(
            (e as { target?: unknown }).target,
            new Set(nodes.map((n) => n.id)),
          );
          if (!nodeId) return;

          const nodeData = nodes.find((n) => n.id === nodeId);
          if (nodeData) {
            callbackRef.current?.(nodeData);
          }
        } catch (err) {
          console.warn('[GraphView] 节点点击解析失败，已忽略本次点击', err);
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

  // 容器尺寸变化（窗口缩放、侧栏折叠）时同步画布尺寸，保持图谱占满可用区域
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const graph = graphRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (!graph || width <= 0 || height <= 0) return;
        graph.resize(width, height);
      });
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // 数据更新（切换会话/重新查询）
  // 初始化完成前的数据由 dataRef 在创建实例时读取，这里只处理实例已存在的情况
  // data 为 null（如新建会话）时必须显式清空画布，否则旧图谱会残留
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    let cancelled = false;

    (async () => {
      graph.setData(data ? transformData(data) : { nodes: [], edges: [] });
      await graph.render();
      if (cancelled) return;

      // 切换会话时容器尺寸可能已变化，先同步画布尺寸再自适应，避免图谱缩在一角
      const container = containerRef.current;
      if (container && container.clientWidth > 0 && container.clientHeight > 0) {
        graph.resize(container.clientWidth, container.clientHeight);
      }
      if (data && data.nodes.length > 0) {
        await graph.fitView();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data]);

  const empty = !data || data.nodes.length === 0;

  const handleZoomIn = () => {
    void graphRef.current?.zoomBy(1.2);
  };

  const handleZoomOut = () => {
    void graphRef.current?.zoomBy(1 / 1.2);
  };

  const handleFitView = () => {
    void graphRef.current?.fitView();
  };

  /** 导出当前图谱为 PNG（overall：完整画布，不受视口裁剪影响） */
  const handleExport = async () => {
    const graph = graphRef.current;
    if (!graph || exporting) return;
    setExporting(true);
    try {
      const dataUrl = await graph.toDataURL({ mode: 'overall' });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `企业关联图谱-${stamp}.png`;
      link.click();
    } catch {
      // 导出失败时按钮恢复可用，用户可重试
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
        aria-label="企业关联关系图谱"
      />
      {!empty && (
        <div
          style={{
            position: 'absolute',
            top: 'var(--space-sm)',
            right: 'var(--space-sm)',
            display: 'flex',
            gap: 'var(--space-xs)',
          }}
          aria-label="图谱工具栏"
        >
          <button type="button" style={toolButtonStyle} onClick={handleZoomIn} aria-label="放大图谱">
            放大
          </button>
          <button type="button" style={toolButtonStyle} onClick={handleZoomOut} aria-label="缩小图谱">
            缩小
          </button>
          <button type="button" style={toolButtonStyle} onClick={handleFitView} aria-label="适应画布">
            适应画布
          </button>
          <button
            type="button"
            style={toolButtonStyle}
            onClick={() => void handleExport()}
            disabled={exporting}
            aria-label="导出图谱为图片"
          >
            {exporting ? '导出中…' : '导出图片'}
          </button>
        </div>
      )}
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
