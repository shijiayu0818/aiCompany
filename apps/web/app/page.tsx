'use client';

// 主页面：三栏布局 + SSE 流式编排消费
// 左 SessionList | 中 GraphView + AgentProcess + ChatInput | 右 NodeDetail
// AGENTS.md: 多轮对话状态由 MemorySaver（threadId）管理，前端只做展示

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ChatInput } from '../components/ChatInput';
import { SessionList } from '../components/SessionList';
import { AgentProcess } from '../components/AgentProcess';
import { NodeDetail } from '../components/NodeDetail';
import type { GraphData, GraphNode } from '@ai/shared';
import type {
  SSEEvent,
  SessionMeta,
  AgentProcessState,
  ProcessStep,
} from '../lib/types';

// G6 组件动态加载（ssr: false 避免 SSR 模块级 window 引用）
const GraphView = dynamic(
  () => import('../components/GraphView').then((m) => m.GraphView),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          fontSize: 'var(--font-sm)',
          color: 'var(--color-text-tertiary)',
        }}
      >
        加载图谱组件…
      </div>
    ),
  },
);

const SESSIONS_KEY = 'ai-enterprise-sessions';

export default function HomePage() {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [process, setProcess] = useState<AgentProcessState | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 从 sessionStorage 恢复会话列表
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SESSIONS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SessionMeta[];
        setSessions(parsed);
        if (parsed.length > 0) {
          setActiveThreadId(parsed[0].threadId);
        }
      }
    } catch {
      // sessionStorage 不可用或数据损坏，忽略
    }
  }, []);

  // 持久化会话列表
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    } catch {
      // 忽略写入失败
    }
  }, [sessions]);

  /** 发送查询，消费 SSE 流 */
  const handleSend = useCallback(
    async (query: string) => {
      setLoading(true);
      setError(null);
      setProcess({ steps: [], graphReady: false });
      setSelectedNode(null);

      const threadId = activeThreadId ?? crypto.randomUUID();
      if (!activeThreadId) {
        setActiveThreadId(threadId);
        setGraphData(null); // 新会话清空图谱
      }

      // 更新会话列表
      setSessions((prev) => {
        const existing = prev.find((s) => s.threadId === threadId);
        const title =
          query.length > 20 ? query.slice(0, 20) + '…' : query;
        if (existing) {
          return prev.map((s) =>
            s.threadId === threadId ? { ...s, lastQuery: query } : s,
          );
        }
        return [
          { threadId, title, createdAt: Date.now(), lastQuery: query },
          ...prev,
        ];
      });

      try {
        const response = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, threadId }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        if (!response.body) {
          throw new Error('响应体为空');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // 逐块解析 SSE 事件
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() ?? '';

          for (const chunk of chunks) {
            const dataLine = chunk
              .split('\n')
              .find((l) => l.startsWith('data: '));
            if (!dataLine) continue;
            const event = JSON.parse(dataLine.slice(6)) as SSEEvent;

            switch (event.type) {
              case 'supervisor': {
                const steps: ProcessStep[] = [];
                if (event.data.needsCompanyInfo)
                  steps.push({ node: 'company_node', label: '企业信息', status: 'pending' });
                if (event.data.needsGraph)
                  steps.push({ node: 'graph_node', label: '客户图谱', status: 'pending' });
                if (event.data.needsBusiness)
                  steps.push({ node: 'business_node', label: '工商资料', status: 'pending' });
                setProcess({ supervisor: event.data, steps, graphReady: false });
                break;
              }
              case 'worker':
                setProcess((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    steps: prev.steps.map((s) =>
                      s.node === event.data.node
                        ? { ...s, status: event.data.status, output: event.data.output }
                        : s,
                    ),
                  };
                });
                break;
              case 'graph':
                setGraphData(event.data.currentGraph);
                setProcess((prev) =>
                  prev ? { ...prev, graphReady: true } : prev,
                );
                break;
              case 'error':
                setError(event.message);
                break;
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [activeThreadId],
  );

  /** 新建会话 */
  const handleNewSession = useCallback(() => {
    setActiveThreadId(null);
    setGraphData(null);
    setProcess(null);
    setSelectedNode(null);
    setError(null);
  }, []);

  /** 切换会话（从 MemorySaver 恢复展示） */
  const handleSelectSession = useCallback(async (threadId: string) => {
    setActiveThreadId(threadId);
    setSelectedNode(null);
    setError(null);
    setProcess(null);

    try {
      const response = await fetch(`/api/agent?threadId=${threadId}`);
      if (response.ok) {
        const data = (await response.json()) as {
          currentGraph?: GraphData;
          reasoning?: string;
          supervisorTask?: string;
        };
        setGraphData(data.currentGraph ?? null);
        if (data.reasoning) {
          setProcess({
            supervisor: {
              taskDescription: data.supervisorTask ?? '',
              needsCompanyInfo: false,
              needsGraph: false,
              needsBusiness: false,
              reasoning: data.reasoning,
            },
            steps: [],
            graphReady: !!data.currentGraph,
          });
        }
      }
    } catch {
      // MemorySaver 中无此会话（服务重启），忽略
    }
  }, []);

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1>AI 企业智能助手</h1>
        <span
          style={{
            fontSize: 'var(--font-sm)',
            color: 'var(--color-text-tertiary)',
          }}
        >
          自然语言查询 · 关联关系图谱 · 多轮对话
        </span>
      </header>
      <main className="app-main">
        <aside className="app-sidebar">
          <SessionList
            sessions={sessions}
            activeThreadId={activeThreadId}
            onSelect={handleSelectSession}
            onNew={handleNewSession}
          />
        </aside>
        <section className="app-center">
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <GraphView data={graphData} onNodeClick={setSelectedNode} />
          </div>
          {error && (
            <div
              style={{
                padding: 'var(--space-sm) var(--space-md)',
                fontSize: 'var(--font-sm)',
                color: 'var(--color-danger)',
                background: 'rgba(239, 68, 68, 0.1)',
                borderTop: '1px solid var(--color-border)',
              }}
            >
              {error}
            </div>
          )}
          <div
            style={{
              maxHeight: 200,
              overflowY: 'auto',
              borderTop: '1px solid var(--color-border)',
              background: 'var(--color-bg-secondary)',
            }}
          >
            <AgentProcess process={process} />
          </div>
          <ChatInput onSend={handleSend} loading={loading} />
        </section>
        <aside className="app-detail">
          <NodeDetail node={selectedNode} />
        </aside>
      </main>
    </div>
  );
}
