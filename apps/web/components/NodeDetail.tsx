'use client';

import type { GraphData, GraphNode } from '@ai/shared';

interface NodeDetailProps {
  node: GraphNode | null;
  /** 当前会话图谱数据：用于展示选中节点的关联关系 */
  graphData: GraphData | null;
}

const NODE_TYPE_LABELS: Record<string, string> = {
  enterprise: '企业',
  person: '人员',
  shareholder: '股东',
};

const NODE_TYPE_COLORS: Record<string, string> = {
  enterprise: 'var(--color-node-enterprise)',
  person: 'var(--color-node-person)',
  shareholder: 'var(--color-node-shareholder)',
};

export function NodeDetail({ node, graphData }: NodeDetailProps) {
  if (!node) {
    return (
      <div
        style={{
          padding: 'var(--space-lg)',
          fontSize: 'var(--font-sm)',
          color: 'var(--color-text-tertiary)',
          textAlign: 'center',
        }}
      >
        点击图谱节点查看详情
      </div>
    );
  }

  let detail: unknown = node.detail;
  if (node.detail) {
    try {
      detail = JSON.parse(node.detail);
    } catch {
      detail = node.detail;
    }
  }

  // 与选中节点相连的边：关系文字从画布移到详情中展示
  const relatedEdges = (graphData?.edges ?? []).filter(
    (edge) => edge.source === node.id || edge.target === node.id,
  );
  const nodeNameById = new Map(
    (graphData?.nodes ?? []).map((n) => [n.id, n.name] as const),
  );

  return (
    <div style={{ padding: 'var(--space-md)' }}>
      {/* 节点标题 */}
      <div style={{ marginBottom: 'var(--space-md)' }}>
        <h2
          style={{
            fontSize: 'var(--font-xl)',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: 'var(--space-xs)',
          }}
        >
          {node.name}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: NODE_TYPE_COLORS[node.type] ?? 'var(--color-edge)',
            }}
          />
          <span
            style={{
              fontSize: 'var(--font-sm)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {NODE_TYPE_LABELS[node.type] ?? node.type}
          </span>
        </div>
      </div>

      {/* 基本信息 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-sm)',
          marginBottom: 'var(--space-md)',
        }}
      >
        {node.refId && <InfoRow label="ID" value={node.refId} />}
        {node.meta && <InfoRow label="标记" value={node.meta} />}
      </div>

      {/* 详情 */}
      {detail != null && (
        <div>
          <h3
            style={{
              fontSize: 'var(--font-sm)',
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
              marginBottom: 'var(--space-sm)',
              paddingBottom: 'var(--space-xs)',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            详情
          </h3>
          <pre
            style={{
              fontSize: 'var(--font-xs)',
              color: 'var(--color-text-primary)',
              background: 'var(--color-bg-primary)',
              padding: 'var(--space-sm)',
              borderRadius: 'var(--radius-md)',
              overflowX: 'auto',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {typeof detail === 'string'
              ? detail
              : JSON.stringify(detail, null, 2)}
          </pre>
        </div>
      )}

      {/* 关联关系（画布上不再绘制边文字，关系信息在详情中展示） */}
      {relatedEdges.length > 0 && (
        <div style={{ marginTop: 'var(--space-md)' }}>
          <h3
            style={{
              fontSize: 'var(--font-sm)',
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
              marginBottom: 'var(--space-sm)',
              paddingBottom: 'var(--space-xs)',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            关联关系
            <span
              style={{
                marginLeft: 'var(--space-xs)',
                fontSize: 'var(--font-xs)',
                fontWeight: 400,
                color: 'var(--color-text-tertiary)',
              }}
            >
              {relatedEdges.length} 条
            </span>
          </h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {relatedEdges.map((edge) => {
              const isSource = edge.source === node.id;
              const otherId = isSource ? edge.target : edge.source;
              const otherName = nodeNameById.get(otherId) ?? otherId;
              const relation = edge.label ?? edge.type;
              return (
                <li
                  key={edge.id}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 'var(--space-sm)',
                    padding: 'var(--space-xs) 0',
                    fontSize: 'var(--font-xs)',
                    borderBottom: '1px solid var(--color-border-light)',
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      padding: '1px var(--space-xs)',
                      color: 'var(--color-accent)',
                      background: 'var(--color-accent-light)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    {isSource ? '→' : '←'} {relation}
                  </span>
                  <span style={{ color: 'var(--color-text-primary)' }}>
                    {otherName}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 无详情数据时的友好提示 */}
      {detail == null && !node.refId && !node.meta && relatedEdges.length === 0 && (
        <div
          style={{
            padding: 'var(--space-sm)',
            fontSize: 'var(--font-xs)',
            color: 'var(--color-text-tertiary)',
            background: 'var(--color-bg-primary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          该节点暂无更多详情数据
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-sm)',
        fontSize: 'var(--font-sm)',
      }}
    >
      <span style={{ color: 'var(--color-text-tertiary)', minWidth: 48 }}>
        {label}
      </span>
      <span style={{ color: 'var(--color-text-secondary)' }}>{value}</span>
    </div>
  );
}
