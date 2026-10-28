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
  /** 直接回复文本：跳过 Agent 调用时由 Supervisor 返回 */
  directResponse: string | null;
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

  /**
   * 最近一条含完整数据（报告或图谱）的消息
   * directResponse 等轻量回复不携带数据，不应顶掉上一条数据消息的展示：
   * 旧数据消息保持完整展开，右侧详情栏仍展示该消息的企业信息
   */
  const latestDataMessage = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.report || m.graphData) return m;
    }
    return null;
  })();

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
      directResponse: null,
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
        directResponse: null,
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
                // directResponse：跳过所有 Agent 调用，直接显示文本回复
                if (event.data.directResponse) {
                  updateActiveMessage((prev) => ({
                    ...prev,
                    directResponse: event.data.directResponse!,
                    process: { supervisor: event.data, steps: [], graphReady: false },
                    loading: false,
                  }));
                  break;
                }
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
                // 增量报告：每个 Worker 返回后服务端都会下发一次，已有报告时继续更新
                updateActiveMessage((prev) => ({
                  ...prev,
                  report: event.data,
                  // 首次到达才触发打字机 / 渐入，增量更新不重复播放动画
                  animated: prev.report ? prev.animated : true,
                }));
                break;
              case 'done':
                updateActiveMessage((prev) => ({ ...prev, loading: false }));
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
                // 数据消息只有被更新的数据消息顶上来才折叠；
                // 无数据消息（loading 中 / directResponse）永不折叠
                isActive={
                  msg.id === latestDataMessage?.id ||
                  !(msg.report || msg.graphData)
                }
                selectedNode={selectedNode}
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
      </main>
    </div>
  );
}

/** 单条消息渲染：用户查询 + 报告（基本信息后嵌入图谱 + 详情） */
function MessageBlock({
  entry,
  isActive,
  selectedNode,
  onNodeClick,
}: {
  entry: MessageEntry;
  isActive: boolean;
  selectedNode: GraphNode | null;
  onNodeClick: (node: GraphNode) => void;
}) {
  const { query, graphData, report, process, animated, loading, error, directResponse } = entry;
  const isOld = !isActive;
  // 图谱放大展示（全屏浮层）
  const [graphExpanded, setGraphExpanded] = useState(false);

  // 浮层打开时支持 Esc 关闭
  useEffect(() => {
    if (!graphExpanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGraphExpanded(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [graphExpanded]);

  // directResponse：跳过 Agent 调用的直接文本回复
  if (directResponse) {
    return (
      <div className={`message-block ${isOld ? 'message-old' : 'message-active'}`}>
        <div className="message-query">
          <span className="message-query-label">你</span>
          <span className="message-query-text">{query}</span>
        </div>
        <div className="message-direct-response">
          {directResponse}
        </div>
      </div>
    );
  }

  // 图谱区三态判定
  const wantsGraph = !!process?.supervisor?.needsGraph;
  const graphFailed =
    process?.steps.some(
      (s) => s.node === 'graph_node' && s.status === 'error',
    ) ?? false;
  // 图谱查询失败时不渲染兜底单节点图（孤节点无边等同于无结果，避免误导）
  const showGraph = !!graphData && !graphFailed;
  // 无结果提示：查询失败立即提示；或本次需要图谱但查询结束仍无数据
  const showGraphEmpty =
    !showGraph && (graphFailed || (!loading && wantsGraph && !graphData));
  // 图谱生成中：只给一行轻提示，不再用大块 loading 占位或遮罩盖住图谱区
  const showGraphPending = !showGraph && !showGraphEmpty && loading;
  const showGraphRow = showGraph || showGraphEmpty;
  // 整体无结果：企业主体也未找到（报告与图谱都为空）
  const noResult = !loading && !report && !graphData && !error;

  // 图谱小窗内容（正常图谱 / 无法搜索）
  const graphBody = showGraph ? (
    <GraphView data={graphData!} onNodeClick={onNodeClick} />
  ) : (
    <div className="message-graph-status" role="status">
      无法搜索该内容
    </div>
  );

  // 报告板块就绪状态：查询中未返回的板块先不渲染，避免提前出现「暂无」空状态
  const supervisor = process?.supervisor;
  const stepReturned = (node: string) => {
    const status = process?.steps.find((s) => s.node === node)?.status;
    return status === 'done' || status === 'error' || status === 'skipped';
  };
  const readiness = {
    company: stepReturned('company_node'),
    graph:
      !!supervisor && (!supervisor.needsGraph || stepReturned('graph_node')),
    business:
      !!supervisor &&
      (!supervisor.needsBusiness || stepReturned('business_node')),
  };

  // 基本信息结束后的图谱（左小块）+ 详情（右侧）；未就绪时只显示一行提示
  const graphAndDetail = showGraphRow ? (
    <div className="message-graph-row">
      <div className="message-graph-block">
        <div className="message-graph-head">
          <h4 className="report-block-title">关联图谱</h4>
          {showGraph && (
            <button
              type="button"
              className="message-graph-expand"
              onClick={() => setGraphExpanded(true)}
              aria-label="放大展示图谱"
            >
              放大
            </button>
          )}
        </div>
        <div className="message-graph-body">{graphBody}</div>
      </div>

      {/* 图谱查询失败或无数据时不展示详情 */}
      {showGraph && (
        <div className="message-detail-block">
          <NodeDetail
            node={selectedNode}
            graphData={graphData}
            enterprise={report?.enterprise}
          />
        </div>
      )}
    </div>
  ) : showGraphPending ? (
    <div className="message-graph-pending" role="status">
      <span className="message-graph-pending-spinner" aria-hidden="true" />
      关联图谱生成中…
    </div>
  ) : null;

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
          <div className="message-report-col">
            <EnterpriseReportPanel
              report={report}
              streaming={loading}
              progressText={buildProgressText(process)}
              animated={animated}
              readiness={readiness}
              afterBasicInfo={graphAndDetail}
            />

            {noResult && (
              <div className="message-no-result" role="status">
                无法搜索该内容
              </div>
            )}

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

      {/* 图谱放大浮层 */}
      {graphExpanded && graphData && (
        <div
          className="graph-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="图谱放大展示"
          onClick={() => setGraphExpanded(false)}
        >
          <div className="graph-modal" onClick={(e) => e.stopPropagation()}>
            <div className="graph-modal-head">
              <span className="graph-modal-title">
                关联图谱 · {graphData.nodes.length} 节点 / {graphData.edges.length} 边
              </span>
              <button
                type="button"
                className="graph-modal-close"
                onClick={() => setGraphExpanded(false)}
                aria-label="关闭图谱放大展示"
              >
                关闭
              </button>
            </div>
            <div className="graph-modal-body">
              <GraphView
                data={graphData}
                onNodeClick={onNodeClick}
              />
            </div>
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
