'use client';

import type { AgentProcessState, ProcessStep } from '../lib/types';

interface AgentProcessProps {
  process: AgentProcessState | null;
}

const WORKER_LABELS: Record<string, string> = {
  company_node: '企业信息',
  graph_node: '客户图谱',
  business_node: '工商资料',
};

const STATUS_STYLES: Record<ProcessStep['status'], { color: string; label: string }> = {
  pending: { color: 'var(--color-text-tertiary)', label: '待执行' },
  running: { color: 'var(--color-warning)', label: '执行中' },
  done: { color: 'var(--color-success)', label: '完成' },
  error: { color: 'var(--color-danger)', label: '失败' },
  skipped: { color: 'var(--color-text-tertiary)', label: '跳过' },
};

export function AgentProcess({ process }: AgentProcessProps) {
  if (!process) {
    return (
      <div
        style={{
          padding: 'var(--space-md)',
          fontSize: 'var(--font-xs)',
          color: 'var(--color-text-tertiary)',
          textAlign: 'center',
        }}
      >
        等待查询…
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 'var(--space-sm) var(--space-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-sm)',
      }}
    >
      {/* Supervisor 决策 */}
      {process.supervisor && (
        <div
          style={{
            padding: 'var(--space-sm) var(--space-md)',
            background: 'var(--color-bg-tertiary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div
            style={{
              fontSize: 'var(--font-xs)',
              fontWeight: 600,
              color: 'var(--color-accent)',
              marginBottom: 'var(--space-xs)',
            }}
          >
            Supervisor 决策
          </div>
          <div
            style={{
              fontSize: 'var(--font-xs)',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.5,
              marginBottom: 'var(--space-sm)',
            }}
          >
            {process.supervisor.reasoning}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
            {process.supervisor.needsCompanyInfo && <Tag color="enterprise" label="企业信息" />}
            {process.supervisor.needsGraph && <Tag color="person" label="客户图谱" />}
            {process.supervisor.needsBusiness && <Tag color="shareholder" label="工商资料" />}
            {!process.supervisor.needsCompanyInfo &&
              !process.supervisor.needsGraph &&
              !process.supervisor.needsBusiness && (
                <span style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-tertiary)' }}>
                  无需调用 Worker
                </span>
              )}
          </div>
        </div>
      )}

      {/* Worker 执行状态 */}
      {process.steps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
          {process.steps.map((step) => {
            const style = STATUS_STYLES[step.status];
            return (
              <div
                key={step.node}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'var(--space-xs) var(--space-sm)',
                  fontSize: 'var(--font-xs)',
                }}
              >
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  {WORKER_LABELS[step.node] ?? step.node}
                </span>
                <span style={{ color: style.color, fontWeight: 500 }}>
                  {style.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* 图谱就绪状态 */}
      {process.graphReady && (
        <div
          style={{
            fontSize: 'var(--font-xs)',
            color: 'var(--color-success)',
            textAlign: 'center',
            padding: 'var(--space-xs)',
          }}
        >
          图谱已更新
        </div>
      )}
    </div>
  );
}

function Tag({ color, label }: { color: string; label: string }) {
  const colorVar =
    color === 'enterprise'
      ? 'var(--color-node-enterprise)'
      : color === 'person'
        ? 'var(--color-node-person)'
        : 'var(--color-node-shareholder)';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px var(--space-sm)',
        fontSize: 'var(--font-xs)',
        color: colorVar,
        background: `${colorVar}20`,
        border: `1px solid ${colorVar}40`,
        borderRadius: 'var(--radius-sm)',
      }}
    >
      {label}
    </span>
  );
}
