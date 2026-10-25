'use client';

import type { GraphNode } from '@ai/shared';

interface NodeDetailProps {
  node: GraphNode | null;
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

export function NodeDetail({ node }: NodeDetailProps) {
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

      {/* 无详情数据时的友好提示 */}
      {detail == null && !node.refId && !node.meta && (
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
