'use client';

import { useState, useRef, type KeyboardEvent } from 'react';

interface ChatInputProps {
  onSend: (query: string) => void;
  loading: boolean;
}

export function ChatInput({ onSend, loading }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    onSend(trimmed);
    setValue('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-sm)',
        padding: 'var(--space-md)',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-bg-secondary)',
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入查询，如「查阿里巴巴的关联企业和工商风险」"
        aria-label="自然语言查询输入框"
        disabled={loading}
        rows={2}
        style={{
          flex: 1,
          padding: 'var(--space-sm) var(--space-md)',
          fontSize: 'var(--font-sm)',
          color: 'var(--color-text-primary)',
          background: 'var(--color-bg-tertiary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          resize: 'none',
          outline: 'none',
          fontFamily: 'var(--font-family)',
        }}
      />
      <button
        onClick={handleSend}
        disabled={loading || !value.trim()}
        aria-label="发送查询"
        style={{
          padding: '0 var(--space-lg)',
          fontSize: 'var(--font-sm)',
          fontWeight: 500,
          color: '#fff',
          background: loading
            ? 'var(--color-text-tertiary)'
            : 'var(--color-accent)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          cursor: loading || !value.trim() ? 'not-allowed' : 'pointer',
          transition: 'background var(--transition-fast)',
        }}
      >
        {loading ? '查询中…' : '发送'}
      </button>
    </div>
  );
}
