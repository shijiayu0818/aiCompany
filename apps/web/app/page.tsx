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
import { EnterpriseReportPanel } from '../components/EnterpriseReport';
import type { EnterpriseReport, GraphData, GraphNode } from '@ai/shared';
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

/** GET /api/agent 返回的会话恢复数据 */
interface SessionStateResponse {
  currentGraph?: GraphData;
  currentReport?: EnterpriseReport;
  reasoning?: string;
  supervisorTask?: string;
}

/** 根据 AgentProcess 状态合成报告区的打字机进度文本 */
function buildProgressText(process: AgentProcessState | null): string {
  if (!process?.supervisor) return '正在分析查询意图…';
  const doneLabels = process.steps
    .filter((s) => s.status === 'done')
    .map((s) => `${s.label}已返回`);
  const active = process.steps.find(
    (s) => s.status === 'running' || s.status === 'pending',
  );
  const parts = [...doneLabels];
  if (active) parts.push(`正在查询${active.label}`);
  if (process.graphReady) parts.push('图谱已更新');
  if (parts.length === 0) return '已确定执行计划，正在调度 Agent…';
  return `${parts.join('，')}…`;
}

export default function HomePage() {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [report, setReport] = useState<EnterpriseReport | null>(null);
  const [process, setProcess] = useState<AgentProcessState | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 报告是否为本次查询新生成（控制标题打字机与板块渐入动画；会话恢复不动画）
  const [reportAnimated, setReportAnimated] = useState(false);

  /** 从服务端持久化的检查点恢复指定会话的展示内容 */
  const loadSession = useCallback(async (threadId: string) => {
    const response = await fetch(`/api/agent?threadId=${threadId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as SessionStateResponse;
    setGraphData(data.currentGraph ?? null);
    setReport(data.currentReport ?? null);
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
  }, []);

  // 从 localStorage 恢复会话列表（初始化不自动恢复任何会话，保持新对话界面）
  useEffect(() => {
    let parsed: SessionMeta[] = [];
    try {
      const stored = localStorage.getItem(SESSIONS_KEY);
      if (stored) parsed = JSON.parse(stored) as SessionMeta[];
    } catch {
      // localStorage 不可用或数据损坏，忽略
    }
    if (parsed.length === 0) return;
    setSessions(parsed);
  }, []);

  // 持久化会话列表
  useEffect(() => {
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
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
      setReportAnimated(false);

      const threadId = activeThreadId ?? crypto.randomUUID();
      if (!activeThreadId) {
        setActiveThreadId(threadId);
        setGraphData(null); // 新会话清空图谱
        setReport(null);
      }

      // 更新会话列表
      setSessions((prev) => {
        const existing = prev.find((s) => s.threadId === threadId);
        const title =
          query.length > 20 ? query.slice(0, 20) + '…' : query;
        if (existing) {
          return prev.map((s) =>
            s.threadId === threadId
              ? { ...s, lastQuery: query, title: s.lastQuery ? s.title : title }
              : s,
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
              case 'report':
                setReport(event.data);
                setReportAnimated(true);
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

  /** 新建会话：复用已有空会话并置顶，或创建新空会话 */
  const handleNewSession = useCallback(() => {
    setError(null);
    setSelectedNode(null);
    setProcess(null);
    setGraphData(null);
    setReport(null);

    // 查找已有空会话（未发送过查询的）
    const emptySession = sessions.find((s) => !s.lastQuery);
    if (emptySession) {
      // 复用空会话：移到第一位并选中
      setActiveThreadId(emptySession.threadId);
      setSessions((prev) => [
        emptySession,
        ...prev.filter((s) => s.threadId !== emptySession.threadId),
      ]);
      return;
    }

    // 没有空会话，创建新的
    const threadId = crypto.randomUUID();
    setActiveThreadId(threadId);
    setSessions((prev) => [
      { threadId, title: '新会话', createdAt: Date.now() },
      ...prev,
    ]);
  }, [sessions]);

  /** 删除会话：从列表移除，若删除的是当前会话则清空展示 */
  const handleDeleteSession = useCallback(
    (threadId: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.threadId !== threadId);
        // 如果删除的是当前会话，清空展示并选中剩余第一个（如有）
        if (threadId === activeThreadId) {
          setActiveThreadId(next[0]?.threadId ?? null);
          setSelectedNode(null);
          setProcess(null);
          setGraphData(null);
          setReport(null);
          setError(null);
        }
        return next;
      });
    },
    [activeThreadId],
  );

  /** 切换会话（从服务端持久化的检查点恢复展示） */
  const handleSelectSession = useCallback(
    async (threadId: string) => {
      if (threadId === activeThreadId) return;
      setActiveThreadId(threadId);
      setSelectedNode(null);
      setError(null);
      setProcess(null);
      setGraphData(null);
      setReport(null);

      const meta = sessions.find((s) => s.threadId === threadId);
      // 尚未查询过的空会话无需恢复
      if (!meta?.lastQuery) return;

      try {
        await loadSession(threadId);
      } catch {
        setError('该会话的历史状态不存在或已过期');
      }
    },
    [activeThreadId, sessions, loadSession],
  );

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
            onDelete={handleDeleteSession}
          />
        </aside>
        <section className="app-center">
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <GraphView data={graphData} loading={loading} onNodeClick={setSelectedNode} />
          </div>
          <EnterpriseReportPanel
            report={report}
            streaming={loading}
            progressText={buildProgressText(process)}
            animated={reportAnimated}
          />
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
          <NodeDetail node={selectedNode} graphData={graphData} />
        </aside>
      </main>
    </div>
  );
}
