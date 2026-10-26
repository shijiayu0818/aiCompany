'use client';

// 主页面：三栏布局 + SSE 流式编排消费
// 左 SessionList | 中 消息列表（图谱+报告） + ChatInput | 右 NodeDetail
// AGENTS.md: 多轮对话状态由 MemorySaver（threadId）管理，前端只做展示

import { useState, useCallback, useEffect, useRef } from 'react';
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

/** 多轮消息数组：每条是一次完整查询的快照 */
interface MessageEntry {
  id: string;
  query: string;
  graphData: GraphData | null;
  report: EnterpriseReport | null;
  process: AgentProcessState | null;
  animated: boolean;
  loading: boolean;
  error: string | null;
}

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
  // 多轮消息数组：每次提问 push 一条，历史消息为只读快照
  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  // 消息列表容器 ref：用于自动滚到底部
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /** 当前活动消息（最新一条） */
  const activeMessage = messages[messages.length - 1] ?? null;

  /** 更新最后一条消息的辅助 */
  const updateActiveMessage = useCallback(
    (updater: (prev: MessageEntry) => MessageEntry) => {
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        return [...prev.slice(0, -1), updater(prev[prev.length - 1])];
      });
    },
    [],
  );

  /** 从服务端持久化的检查点恢复指定会话的展示内容 */
  const loadSession = useCallback(async (threadId: string) => {
    const response = await fetch(`/api/agent?threadId=${threadId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as SessionStateResponse;
    const sessionMeta = sessions.find((s) => s.threadId === threadId);
    const lastQuery = sessionMeta?.lastQuery ?? data.supervisorTask ?? '';
    const restored: MessageEntry = {
      id: threadId,
      query: lastQuery,
      graphData: data.currentGraph ?? null,
      report: data.currentReport ?? null,
      animated: false,
      loading: false,
      error: null,
      process: data.reasoning
        ? {
            supervisor: {
              taskDescription: data.supervisorTask ?? '',
              needsCompanyInfo: false,
              needsGraph: false,
              needsBusiness: false,
              reasoning: data.reasoning,
            },
            steps: [],
            graphReady: !!data.currentGraph,
          }
        : null,
    };
    setMessages([restored]);
  }, [sessions]);

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
      const threadId = activeThreadId ?? crypto.randomUUID();
      if (!activeThreadId) {
        setActiveThreadId(threadId);
      }

      // 1. push 新消息（loading=true、其余空），历史消息保留
      const newEntry: MessageEntry = {
        id: `${threadId}-${Date.now()}`,
        query,
        graphData: null,
        report: null,
        process: { steps: [], graphReady: false },
        animated: false,
        loading: true,
        error: null,
      };
      setMessages((prev) => [...prev, newEntry]);
      setSelectedNode(null);

      // 自动滚到底部
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });

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

        // 逐块解析 SSE 事件，只更新最后一条（活动）消息
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
                updateActiveMessage((prev) => ({
                  ...prev,
                  process: { supervisor: event.data, steps, graphReady: false },
                }));
                break;
              }
              case 'worker':
                updateActiveMessage((prev) => {
                  if (!prev.process) return prev;
                  return {
                    ...prev,
                    process: {
                      ...prev.process,
                      steps: prev.process.steps.map((s) =>
                        s.node === event.data.node
                          ? { ...s, status: event.data.status, output: event.data.output }
                          : s,
                      ),
                    },
                  };
                });
                break;
              case 'graph':
                updateActiveMessage((prev) => ({
                  ...prev,
                  graphData: event.data.currentGraph,
                  process: prev.process
                    ? { ...prev.process, graphReady: true }
                    : prev.process,
                }));
                break;
              case 'report':
                updateActiveMessage((prev) => ({
                  ...prev,
                  report: event.data,
                  animated: true,
                }));
                break;
              case 'error':
                updateActiveMessage((prev) => ({
                  ...prev,
                  error: event.message,
                }));
                break;
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        updateActiveMessage((prev) => ({ ...prev, error: message }));
      } finally {
        updateActiveMessage((prev) => ({ ...prev, loading: false }));
      }
    },
    [activeThreadId, updateActiveMessage],
  );

  /** 新建会话：复用已有空会话并置顶，或创建新空会话 */
  const handleNewSession = useCallback(() => {
    setSelectedNode(null);
    setMessages([]);

    // 查找已有空会话（未发送过查询的）
    const emptySession = sessions.find((s) => !s.lastQuery);
    if (emptySession) {
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
        if (threadId === activeThreadId) {
          setActiveThreadId(next[0]?.threadId ?? null);
          setSelectedNode(null);
          setMessages([]);
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
      setMessages([]);

      const meta = sessions.find((s) => s.threadId === threadId);
      // 尚未查询过的空会话无需恢复
      if (!meta?.lastQuery) return;

      try {
        await loadSession(threadId);
      } catch {
        // 恢复失败，保留空消息列表
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
          {/* 消息列表区：可滚动，历史消息向上滑走 */}
          <div className="app-messages">
            {messages.length === 0 && (
              <div className="app-empty-hint">
                输入查询开始对话
              </div>
            )}
            {messages.map((msg) => (
              <MessageBlock
                key={msg.id}
                entry={msg}
                isActive={msg.id === activeMessage?.id}
                onNodeClick={setSelectedNode}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
          {/* 输入框固定底部 */}
          <ChatInput
            onSend={handleSend}
            loading={activeMessage?.loading ?? false}
          />
        </section>
        <aside className="app-detail">
          <NodeDetail
            node={selectedNode}
            graphData={activeMessage?.graphData ?? null}
            enterprise={activeMessage?.report?.enterprise}
          />
        </aside>
      </main>
    </div>
  );
}

/** 单条消息渲染：用户查询 + 图谱 + 报告 + 进度 */
function MessageBlock({
  entry,
  isActive,
  onNodeClick,
}: {
  entry: MessageEntry;
  isActive: boolean;
  onNodeClick: (node: GraphNode) => void;
}) {
  const { query, graphData, report, process, animated, loading, error } = entry;
  const isOld = !isActive;

  return (
    <div className={`message-block ${isOld ? 'message-old' : 'message-active'}`}>
      {/* 用户查询语句 */}
      <div className="message-query">
        <span className="message-query-label">你</span>
        <span className="message-query-text">{query}</span>
      </div>

      {/* 旧消息的图谱/报告折叠为概要，活动消息完整渲染 */}
      {isOld ? (
        <MessageSnapshot entry={entry} />
      ) : (
        <div className="message-active-content">
          {/* 左：图谱 */}
          <div className="message-graph">
            {graphData ? (
              <GraphView
                data={graphData}
                loading={loading}
                onNodeClick={onNodeClick}
              />
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--font-sm)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                {loading ? '正在生成图谱…' : '等待图谱数据…'}
              </div>
            )}
          </div>

          {/* 右：报告 + 进度 + 错误 */}
          <div className="message-report-col">
            <EnterpriseReportPanel
              report={report}
              streaming={loading}
              progressText={buildProgressText(process)}
              animated={animated}
            />

            {process && (
              <div className="message-process">
                <AgentProcess process={process} />
              </div>
            )}

            {error && (
              <div className="message-error">
                {error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 旧消息折叠概要：企业名 + 风险等级 + 变更数 + 舆情数，避免 G6 重复渲染 */
function MessageSnapshot({ entry }: { entry: MessageEntry }) {
  const { report, graphData } = entry;
  if (!report && !graphData) return null;

  return (
    <div className="message-snapshot">
      {report ? (
        <div className="message-snapshot-info">
          <span className="message-snapshot-name">{report.enterprise.name}</span>
          <span className={`report-grade report-grade-${report.riskAssessment.grade.toLowerCase()}`}>
            {report.riskAssessment.score} 分 · {report.riskAssessment.grade}
          </span>
          {report.changes.length > 0 && (
            <span className="message-snapshot-meta">{report.changes.length} 条变更</span>
          )}
          {report.opinions.length > 0 && (
            <span className="message-snapshot-meta">{report.opinions.length} 条舆情</span>
          )}
        </div>
      ) : graphData ? (
        <div className="message-snapshot-info">
          <span className="message-snapshot-meta">
            图谱 {graphData.nodes.length} 节点 / {graphData.edges.length} 边
          </span>
        </div>
      ) : null}
    </div>
  );
}
