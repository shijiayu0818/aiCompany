'use client';

import type { Enterprise, GraphData, GraphNode } from '@ai/shared';

interface NodeDetailProps {
  node: GraphNode | null;
  /** 当前会话图谱数据：用于展示选中节点的关联关系 */
  graphData: GraphData | null;
  /** 当前查询的企业：未点节点时展示其详情 */
  enterprise?: Enterprise;
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

export function NodeDetail({ node, graphData, enterprise }: NodeDetailProps) {
  // 模式一：点击了图谱节点 → 展示该节点详情
  if (node) {
    return <NodeMode node={node} graphData={graphData} />;
  }
  // 模式二：未点节点，但有查询企业 → 展示查询企业详情
  if (enterprise) {
    return <EnterpriseMode enterprise={enterprise} graphData={graphData} />;
  }
  // 模式三：都没有 → 空提示
  return (
    <div
      style={{
        padding: 'var(--space-lg)',
        fontSize: 'var(--font-sm)',
        color: 'var(--color-text-tertiary)',
        textAlign: 'center',
      }}
    >
      点击图谱节点或发送查询后展示详情
    </div>
  );
}

/** 模式一：节点详情 */
function NodeMode({ node, graphData }: { node: GraphNode; graphData: GraphData | null }) {
  let detail: unknown = node.detail;
  if (node.detail) {
    try {
      detail = JSON.parse(node.detail);
    } catch {
      detail = node.detail;
    }
  }

  const relatedEdges = (graphData?.edges ?? []).filter(
    (edge) => edge.source === node.id || edge.target === node.id,
  );
  const nodeNameById = new Map(
    (graphData?.nodes ?? []).map((n) => [n.id, n.name] as const),
  );

  return (
    <div style={{ padding: 'var(--space-md)' }}>
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

/** 模式二：查询企业详情 */
function EnterpriseMode({
  enterprise,
  graphData,
}: {
  enterprise: Enterprise;
  graphData: GraphData | null;
}) {
  // 企业在图谱中的关联节点
  const relatedEdges = (graphData?.edges ?? []).filter(
    (edge) => edge.source === enterprise.id || edge.target === enterprise.id,
  );
  const nodeNameById = new Map(
    (graphData?.nodes ?? []).map((n) => [n.id, n.name] as const),
  );

  return (
    <div style={{ padding: 'var(--space-md)' }}>
      <div style={{ marginBottom: 'var(--space-md)' }}>
        <h2
          style={{
            fontSize: 'var(--font-xl)',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: 'var(--space-xs)',
          }}
        >
          {enterprise.name}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: NODE_TYPE_COLORS.enterprise,
            }}
          />
          <span
            style={{
              fontSize: 'var(--font-sm)',
              color: 'var(--color-text-secondary)',
            }}
          >
            查询目标
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-sm)',
          marginBottom: 'var(--space-md)',
        }}
      >
        {enterprise.creditCode && <InfoRow label="信用代码" value={enterprise.creditCode} />}
        {enterprise.legalPerson && <InfoRow label="法定代表人" value={enterprise.legalPerson} />}
        {enterprise.registeredCapital && <InfoRow label="注册资本" value={enterprise.registeredCapital} />}
        {enterprise.establishDate && <InfoRow label="成立日期" value={enterprise.establishDate} />}
        {enterprise.status && <InfoRow label="经营状态" value={enterprise.status} />}
        {enterprise.industry && <InfoRow label="所属行业" value={enterprise.industry} />}
        {enterprise.region && <InfoRow label="所在地区" value={enterprise.region} />}
      </div>

      {enterprise.description && (
        <div style={{ marginBottom: 'var(--space-md)' }}>
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
            经营范围
          </h3>
          <p
            style={{
              fontSize: 'var(--font-xs)',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.6,
            }}
          >
            {enterprise.description}
          </p>
        </div>
      )}

      {relatedEdges.length > 0 && (
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
            图谱关联
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
              const isSource = edge.source === enterprise.id;
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
      <span style={{ color: 'var(--color-text-tertiary)', minWidth: 64 }}>
        {label}
      </span>
      <span style={{ color: 'var(--color-text-secondary)', wordBreak: 'break-all' }}>
        {value}
      </span>
    </div>
  );
}
