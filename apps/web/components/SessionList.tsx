'use client';

import type { SessionMeta } from '../lib/types';

interface SessionListProps {
  sessions: SessionMeta[];
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
  onNew: () => void;
}

export function SessionList({
  sessions,
  activeThreadId,
  onSelect,
  onNew,
}: SessionListProps) {
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
          <button
            key={s.threadId}
            onClick={() => onSelect(s.threadId)}
            aria-label={`切换到会话 ${s.title}`}
            style={{
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
          </button>
        ))}
      </div>
    </div>
  );
}
