'use client';

import { useState } from 'react';
import type { SessionMeta } from '../lib/types';

interface SessionListProps {
  sessions: SessionMeta[];
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
  onNew: () => void;
  onDelete: (threadId: string) => void;
}

export function SessionList({
  sessions,
  activeThreadId,
  onSelect,
  onNew,
  onDelete,
}: SessionListProps) {
  // 待确认删除的会话：点击 × 先弹确认，避免误删历史会话
  const [pendingDelete, setPendingDelete] = useState<SessionMeta | null>(null);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-md)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <span
          style={{
            fontSize: 'var(--font-sm)',
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
          }}
        >
          会话列表
        </span>
        <button
          onClick={onNew}
          aria-label="新建会话"
          style={{
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'var(--font-lg)',
            color: 'var(--color-text-primary)',
            background: 'var(--color-bg-tertiary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            transition: 'background var(--transition-fast)',
          }}
        >
          +
        </button>
      </div>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-sm)',
        }}
      >
        {sessions.length === 0 && (
          <p
            style={{
              padding: 'var(--space-md)',
              fontSize: 'var(--font-xs)',
              color: 'var(--color-text-tertiary)',
              textAlign: 'center',
            }}
          >
            暂无会话，点击 + 新建
          </p>
        )}
        {sessions.map((s) => (
          <div
            key={s.threadId}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(s.threadId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(s.threadId);
              }
            }}
            aria-label={`切换到会话 ${s.title}`}
            style={{
              position: 'relative',
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: 'var(--space-sm) var(--space-md)',
              marginBottom: 'var(--space-xs)',
              background:
                s.threadId === activeThreadId
                  ? 'var(--color-accent-light)'
                  : 'transparent',
              border:
                s.threadId === activeThreadId
                  ? '1px solid var(--color-accent)'
                  : '1px solid transparent',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              transition: 'background var(--transition-fast)',
            }}
          >
            <div
              style={{
                fontSize: 'var(--font-sm)',
                fontWeight: 500,
                color: 'var(--color-text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                paddingRight: 'var(--space-lg)',
              }}
            >
              {s.title}
            </div>
            {s.lastQuery && (
              <div
                style={{
                  fontSize: 'var(--font-xs)',
                  color: 'var(--color-text-tertiary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginTop: 'var(--space-xs)',
                }}
              >
                {s.lastQuery}
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPendingDelete(s);
              }}
              aria-label={`删除会话 ${s.title}`}
              style={{
                position: 'absolute',
                top: 'var(--space-sm)',
                right: 'var(--space-sm)',
                width: 20,
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 'var(--font-xs)',
                color: 'var(--color-text-tertiary)',
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                opacity: 0.6,
                transition: 'opacity var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.color = 'var(--color-danger)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.6';
                e.currentTarget.style.color = 'var(--color-text-tertiary)';
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* 删除确认弹窗：提示删除后历史会话不可恢复 */}
      {pendingDelete && (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="删除会话确认"
          onClick={() => setPendingDelete(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setPendingDelete(null);
          }}
        >
          <div
            className="confirm-dialog"
            role="document"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="confirm-title">删除会话</h3>
            <p className="confirm-text">
              确定删除「{pendingDelete.title}」吗？
              <br />
              删除后该会话的历史查询记录将无法恢复。
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                className="confirm-btn confirm-btn-cancel"
                onClick={() => setPendingDelete(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="confirm-btn confirm-btn-danger"
                onClick={() => {
                  onDelete(pendingDelete.threadId);
                  setPendingDelete(null);
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
